"""Privacy policy and terms, served at /privacy and /terms (the App Store needs both URLs).
Set KLEOS_CONTACT_EMAIL and KLEOS_COMPANY on the server. Have a lawyer read these before launch."""
from __future__ import annotations

import html
import os

CONTACT = os.environ.get("KLEOS_CONTACT_EMAIL", "support@example.com")
COMPANY = os.environ.get("KLEOS_COMPANY", "Kleos")
UPDATED = "17 October 2026"

STYLE = """<style>body{font:16px/1.6 -apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#121218}
h1{font-weight:600;letter-spacing:-.02em;color:#1608F2}h2{font-size:18px;margin-top:32px}p,li{color:#33333d}a{color:#1608F2}small{color:#8e8e99}</style>"""


def _page(title: str, body: str) -> str:
    return f"<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{html.escape(title)} · Kleos</title>{STYLE}</head><body><h1>{html.escape(title)}</h1><small>Last updated {UPDATED}</small>{body}</body></html>"


def privacy() -> str:
    return _page("Privacy Policy", f"""
<p>Kleos is a practice app for how you come across in conversation. This policy explains what we collect, why, and what we never do. {html.escape(COMPANY)} operates Kleos. Contact: <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>
<h2>Your account</h2>
<p>Kleos works from the first launch without you signing up. The app creates a private guest account on our server so your plan and weekly allowance can be counted; it’s identified by a random token kept in your phone’s keychain (we store only a hash of it). Your progress, scores, transcripts and history are stored on your phone.</p>
<p>If you choose to save your account, we keep the email address you verify with a one-time code, or the private identifier Sign in with Apple gives us (Apple may relay your email; we never see your Apple ID password). We use it only to sign you in, to carry your plan and register number to a new phone and to the Members page on our website, and to send you sign-in codes. Sign-in codes are stored hashed and expire after 15 minutes. If you joined the waitlist with the same email, your register number is linked to the account.</p>
<p>A saved account also keeps a short summary your app sends so the Members page can show it: your Aura Index, streak, number of calls, laurels, archetype and the titles and scores of your last few reads. Nothing else from your phone is uploaded for it. On the website, your session is kept in a cookie that page scripts can’t read; signing out ends it.</p>
<p>If you put a name on a Debate Duel, it’s stored with that duel (see below).</p>
<h2>What is processed, and for how long</h2>
<ul>
<li><b>Live conversations.</b> Your voice is streamed to our voice provider (ElevenLabs) to transcribe it and voice the characters. After the call we download the recording, measure your delivery (pace, fillers, pauses, pitch range), then delete it from our provider. We keep our copy of the recording for at most two hours so you can make an Aura Replay clip of the moment it turned; then it and any clip are deleted automatically. We keep the transcript and the measurements only for as long as your session is open on our server (at most a few hours), then they are discarded. The read you see is saved on your phone.</li>
<li><b>Recorded takes</b> (Aura Farm, Debate Duels). Video is analysed for voice and, if visible, eye contact and posture, then deleted. For Aura Farm we keep the take only long enough to make the rated video you can save (seconds), and that video is deleted from our server within two hours. For Debate Duels we keep the name you entered, the transcript and the measurements of each take, and the verdict, so your opponent can answer later. Duels are deleted after 30 days.</li>
<li><b>Rate a Clip and Profile Read.</b> We extract a few still frames and the audio transcript (clips) or read the screenshots you choose, send them to our AI provider for the read, and delete them right after. We judge behaviour and presentation, never anyone’s looks, body or identity, and we never try to identify people.</li>
<li><b>Fit check and Wardrobe.</b> Outfit photos and the photos of clothes you add are sent to our AI provider for the read and are not stored on our server. Your wardrobe photos stay on your phone; when you build a fit, only the text descriptions of your pieces are sent. Colouring (undertone, hair and eye colour) is read only to suggest clothing colours. We rate clothes, never faces or bodies.</li>
<li><b>Poise chat.</b> What you type or say is sent to our AI provider to write the reply, and isn’t stored on our server. If you mention something coming up (an occasion), it’s kept on your phone and sent as context with your chats and practice scenes.</li>
<li><b>Before I send this.</b> A draft message you paste, and any screenshot of a conversation you choose, are sent to our AI provider to read and are not stored on our server. Screenshots are read in memory and discarded; only the text Poise read from it comes back to your phone. Draft reads are kept on your phone for 30 days, and you can clear them sooner in You › What Poise remembers. Kleos never sends a message for you. Only share conversations you’re comfortable sharing; the other person’s words are treated as private and never used for anything else.</li>
<li><b>Calling Poise.</b> The call is handled like a live conversation, without a score; our provider’s copy is deleted when you hang up. Poise leaves a short written note in your chat, stored on your phone.</li>
<li><b>Camera during calls</b> (off by default). If you turn it on, the app takes a still from the front camera every few seconds. The stills are measured for eye contact and stillness after the call, then deleted immediately. They are never stored or used to identify you.</li>
<li><b>Invite codes and challenges.</b> Your install gets an invite code. When someone uses it, we record which install used which code, and when their first call and first payment happened, so we can give the rewards. Challenges keep the name you entered, the score and the one-line verdict for 30 days.</li>
<li><b>Help train Poise</b> (off by default). Only if you turn it on, clips you record are kept under a random id to improve our own model. Turn it off any time in You › Your data to delete them.</li>
</ul>
<h2>Who processes data for us</h2>
<p>Anthropic (AI reads and characters), Deepgram (speech to text), ElevenLabs (voice and live calls), RevenueCat and Apple (subscriptions), PostHog (anonymous product analytics: which screens are used and what fails, never what you said), and our hosting provider. Each processes data only to provide its service to us. We don’t sell data and we don’t use it for advertising.</p>
<h2>Faces and biometrics</h2>
<p>When video is analysed, face and body landmarks are reduced to a few numbers per frame (for example, how often you looked at the lens) and discarded. We don’t create face templates, recognise faces or store biometric identifiers.</p>
<h2>Other people</h2>
<p>Only record or upload people who agree to it. Aura Farm asks each player to confirm they are 18+ and consent. If someone appears in a clip you rate, Kleos rates the moment, not the person.</p>
<h2>Your choices</h2>
<p>You › What Poise remembers shows what the app keeps about you and where it came from; remove any of it there. You › Your data › Delete everything erases your history on the phone and deletes your duels and any training clips from our server. You › Account › Delete account deletes your account and everything our server keeps for it (your saved sign-in, allowance, summary, duels and training clips); you can also do this from the Members page. Deleting an account doesn’t cancel an Apple subscription; cancel that in Settings › Apple ID › Subscriptions. You can also email us and we’ll delete anything linked to your account within 30 days.</p>
<h2>Age</h2>
<p>Kleos is for adults 18 and over. Unfiltered mode contains strong language and frank talk about dating.</p>
<h2>Changes</h2>
<p>We’ll update this page when things change and note the date above.</p>
""")


def terms() -> str:
    return _page("Terms of Use", f"""
<p>By using Kleos you agree to these terms and to Apple’s <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Standard End User License Agreement</a>. Contact: <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>
<h2>What Kleos is</h2>
<p>Kleos is entertainment and practice. Scores, reads and archetypes are opinions generated by AI from measured signals and what was said. They are not professional, psychological, medical or legal advice, and they rate a moment, not a person.</p>
<h2>Subscriptions</h2>
<p>Kleos+ and Kleos Black are auto-renewing subscriptions billed through your Apple ID. Payment is charged at confirmation. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period, and your account is charged for renewal within 24 hours before the period ends. Manage or cancel in Settings › Apple ID › Subscriptions. If a free trial is offered, any unused part is forfeited when you buy a subscription. Free features and weekly limits may change.</p>
<h2>Your content and other people</h2>
<p>Only record, upload or rate content you have the right to use, and only include people who agreed to be recorded. Don’t use Kleos to harass, demean or identify anyone, or to write messages meant to deceive, pressure or threaten someone; Poise will decline those. Don’t upload content involving anyone under 18, sexual content, or violence. We may refuse a read and remove content that breaks these rules.</p>
<h2>Characters</h2>
<p>Characters are fictional. In Unfiltered mode they swear and talk frankly about dating, but never describe sex acts and never reward pushing past a no.</p>
<h2>Liability</h2>
<p>Kleos is provided as is. To the extent the law allows, {html.escape(COMPANY)} isn’t liable for indirect or consequential losses arising from your use of the app.</p>
""")
