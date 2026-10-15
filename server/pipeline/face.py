"""Presence measurement from sampled video frames. MediaPipe Face Landmarker + Pose Landmarker.

Measured: eye contact to lens (gaze + head yaw proxy), head stability, blink rate,
self-touch / fidget events, posture (shoulder line tilt, forward lean proxy).
Nothing identifying is stored: landmarks are reduced to numbers per frame and discarded.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, asdict

import cv2
import numpy as np

MODELS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")


@dataclass
class PresenceFacts:
    frames_analysed: int = 0
    face_found_ratio: float = 0.0
    eye_contact_ratio: float = 0.0  # frames with gaze near lens
    longest_contact_s: float = 0.0
    contact_breaks: int = 0
    head_motion: float = 0.0  # mean normalised head displacement per second
    blink_rate_per_min: float = 0.0
    fidget_events: int = 0  # hand near face / rapid shoulder motion
    shoulder_tilt_deg: float = 0.0
    lean: str = "neutral"  # 'back' | 'neutral' | 'forward'
    smile_ratio: float = 0.0  # proxy for nervous smiling when combined with low speech
    available: bool = False

    def to_dict(self):
        return asdict(self)


def _landmarkers():
    import mediapipe as mp
    from mediapipe.tasks import python as mpp
    from mediapipe.tasks.python import vision

    face = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=mpp.BaseOptions(model_asset_path=os.path.join(MODELS, "face_landmarker.task")),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=1,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
        )
    )
    pose = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(
            base_options=mpp.BaseOptions(model_asset_path=os.path.join(MODELS, "pose_landmarker_lite.task")),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=1,
        )
    )
    return mp, face, pose


def analyse(video_path: str, fps_sample: float = 6.0, face_mesh: bool = True) -> PresenceFacts:
    """face_mesh=False: delivery-only mode for people who aren't the account holder (pose only, no face landmarks)."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return PresenceFacts()
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, int(round(src_fps / fps_sample)))
    try:
        mp, face, pose = _landmarkers()
    except Exception:
        cap.release()
        return PresenceFacts()

    gaze_hits, yaws, noses, blinks_series, smiles, fidgets = [], [], [], [], [], 0
    tilts, leans = [], []
    found = 0
    n = 0
    i = 0
    prev_shoulders = None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % step:
            i += 1
            continue
        i += 1
        n += 1
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        fr = face.detect(img) if face_mesh else None
        if fr is not None and fr.face_landmarks:
            found += 1
            lm = fr.face_landmarks[0]
            # head yaw/pitch from the transformation matrix
            yaw = pitch = 0.0
            if fr.facial_transformation_matrixes:
                M = np.array(fr.facial_transformation_matrixes[0]).reshape(4, 4)
                R = M[:3, :3]
                yaw = float(np.degrees(np.arctan2(R[0, 2], R[2, 2])))
                pitch = float(np.degrees(np.arcsin(-R[1, 2])))
            # iris offset within the eye: iris centre (468/473) vs eye corners (33,133 / 362,263)
            def iris_off(ic, c1, c2):
                cx = (lm[c1].x + lm[c2].x) / 2
                w = abs(lm[c1].x - lm[c2].x) + 1e-6
                return (lm[ic].x - cx) / w
            off = (iris_off(468, 33, 133) + iris_off(473, 362, 263)) / 2 if len(lm) > 473 else 0.0
            looking = abs(yaw) < 12 and abs(pitch) < 12 and abs(off) < 0.12
            gaze_hits.append(looking)
            yaws.append(yaw)
            noses.append((lm[1].x, lm[1].y))
            bs = {b.category_name: b.score for b in (fr.face_blendshapes[0] if fr.face_blendshapes else [])}
            blinks_series.append((bs.get("eyeBlinkLeft", 0) + bs.get("eyeBlinkRight", 0)) / 2)
            smiles.append((bs.get("mouthSmileLeft", 0) + bs.get("mouthSmileRight", 0)) / 2)
        else:
            gaze_hits.append(False)
            blinks_series.append(0.0)
            smiles.append(0.0)
        pr = pose.detect(img)
        if pr.pose_landmarks:
            p = pr.pose_landmarks[0]
            ls, rs, nose = p[11], p[12], p[0]
            tilt = float(np.degrees(np.arctan2(rs.y - ls.y, rs.x - ls.x)))
            tilts.append(abs(((tilt + 180) % 360) - 180))
            # forward lean proxy: nose z relative to shoulders (negative z = closer to camera)
            leans.append(nose.z - (ls.z + rs.z) / 2)
            # hands near face
            for wrist in (p[15], p[16]):
                if wrist.visibility > 0.5 and abs(wrist.x - nose.x) < 0.15 and abs(wrist.y - nose.y) < 0.2:
                    fidgets += 1
                    break
            cur = np.array([ls.x, ls.y, rs.x, rs.y])
            if prev_shoulders is not None and np.linalg.norm(cur - prev_shoulders) > 0.12:
                fidgets += 1
            prev_shoulders = cur
    cap.release()
    face.close()
    pose.close()

    if n == 0:
        return PresenceFacts()
    dur = n / fps_sample
    # contact streaks
    longest = cur_run = 0
    breaks = 0
    prev = False
    for g in gaze_hits:
        if g:
            cur_run += 1
            longest = max(longest, cur_run)
        else:
            if prev:
                breaks += 1
            cur_run = 0
        prev = g
    # blinks: rising edges over 0.5
    blinks = sum(1 for a, b in zip(blinks_series, blinks_series[1:]) if a < 0.5 <= b)
    # head motion
    motion = 0.0
    if len(noses) > 1:
        d = np.diff(np.array(noses), axis=0)
        motion = float(np.mean(np.linalg.norm(d, axis=1)) * fps_sample)
    lean_v = float(np.mean(leans)) if leans else 0.0
    lean = "forward" if lean_v < -0.25 else "back" if lean_v > 0.1 else "neutral"

    return PresenceFacts(
        frames_analysed=n,
        face_found_ratio=round(found / n, 2),
        eye_contact_ratio=round(sum(gaze_hits) / n, 2),
        longest_contact_s=round(longest / fps_sample, 1),
        contact_breaks=breaks,
        head_motion=round(motion, 3),
        blink_rate_per_min=round(blinks / max(dur, 1) * 60, 1),
        fidget_events=min(fidgets, 30),
        shoulder_tilt_deg=round(float(np.mean(tilts)), 1) if tilts else 0.0,
        lean=lean,
        smile_ratio=round(float(np.mean([s > 0.4 for s in smiles])), 2) if smiles else 0.0,
        available=found > 0,
    )
