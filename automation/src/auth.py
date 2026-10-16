"""Session-reuse login for control-tower.loadshare.net.

Session state (cookies/local storage) is persisted to auth/session_state.json
so the OTP step is only needed when that session has actually expired.
"""

import threading
import time

from playwright.sync_api import BrowserContext, Page, TimeoutError as PlaywrightTimeoutError

from .config import PROJECT_ROOT, SESSION_STATE_PATH

LOGIN_URL_MARKER = "/login"
ORDERS_PATH = "/orders"
OTP_HANDOFF_PATH = PROJECT_ROOT / "auth" / "otp_input.txt"
OTP_WAIT_SECONDS = 300


class SessionExpiredError(Exception):
    """Raised when the saved session is gone and no OTP arrived in time to log
    back in - e.g. an unattended/scheduled run with nobody present to type it,
    in the browser or anywhere else."""


class SessionExpiredMidRun(Exception):
    """Raised when a saved session looked valid at startup (cookies present,
    /orders didn't redirect within the check window) but the backend token
    was actually expired - the site renders the orders shell optimistically
    and only redirects to /login once a real API call (e.g. Search) gets
    rejected. Callers should re-run ensure_logged_in(force=True) and retry."""


def _fill_otp(page: Page, otp: str) -> None:
    """Type a code we were handed into the page's OTP input(s) and submit."""
    single_field_candidates = [
        page.get_by_placeholder("OTP", exact=False),
        page.locator("input[type='tel']").last,
        page.locator("input[inputmode='numeric']").last,
    ]
    for candidate in single_field_candidates:
        try:
            if candidate.count() > 0 and candidate.first.is_visible():
                candidate.first.fill(otp)
                break
        except Exception:
            continue
    else:
        digit_boxes = page.locator("input[maxlength='1']")
        count = digit_boxes.count()
        if count >= len(otp):
            for i, digit in enumerate(otp):
                digit_boxes.nth(i).fill(digit)
        else:
            raise RuntimeError(
                "Could not find an OTP input field on the page. "
                "The site's OTP screen selector needs to be updated in src/auth.py."
            )

    for label in ["Verify", "Submit", "Login", "Continue"]:
        btn = page.get_by_role("button", name=label, exact=False)
        try:
            if btn.count() > 0 and btn.first.is_visible():
                btn.first.click()
                return
        except Exception:
            continue
    # No explicit submit button found; assume the OTP auto-submits once complete.


def _enter_otp(page: Page) -> None:
    """Get past the OTP screen using whichever of three sources responds first:

      1. the OTP typed straight into the visible browser window - the normal
         case for an attended run, since the site's own OTP screen is already
         on screen in front of whoever is watching,
      2. a code typed at the terminal prompt,
      3. a code written to auth/otp_input.txt (unattended handoff).

    Sources 2 and 3 hand us a string that we fill in; source 1 needs no filling
    and is detected by the app navigating away from /login on its own.

    The wait loop uses page.wait_for_timeout() rather than time.sleep() on
    purpose: sync-API Playwright only services its driver connection from
    inside a Playwright call, so sleeping would leave page.url frozen at the
    login URL and make a browser-side login impossible to notice.
    """
    typed: list[str] = []

    def _try_interactive() -> None:
        # isatty() isn't a reliable signal here - some execution contexts (Task
        # Scheduler, some shells/orchestrators) report a tty that never actually
        # delivers input - so just let this thread block harmlessly if nobody
        # is there; the loop below carries on regardless.
        try:
            code = input("Enter the OTP sent to your phone: ").strip()
            if code:
                typed.append(code)
        except (EOFError, OSError):
            pass

    threading.Thread(target=_try_interactive, daemon=True).start()

    OTP_HANDOFF_PATH.parent.mkdir(parents=True, exist_ok=True)
    if OTP_HANDOFF_PATH.exists():
        OTP_HANDOFF_PATH.unlink()
    print(
        f"Waiting up to {OTP_WAIT_SECONDS}s for the OTP. Enter it whichever way suits:\n"
        f"  - type it into the browser window that's already open on the OTP screen\n"
        f"  - type it at the prompt above\n"
        f"  - write it to {OTP_HANDOFF_PATH}",
        flush=True,
    )

    deadline = time.time() + OTP_WAIT_SECONDS
    while time.time() < deadline:
        if LOGIN_URL_MARKER not in page.url:
            print("OTP was completed in the browser window.", flush=True)
            return

        if typed:
            _fill_otp(page, typed[0])
            return

        if OTP_HANDOFF_PATH.exists():
            code = OTP_HANDOFF_PATH.read_text(encoding="utf-8").strip()
            if code:
                OTP_HANDOFF_PATH.unlink()
                _fill_otp(page, code)
                return

        page.wait_for_timeout(500)

    raise SessionExpiredError(
        f"Timed out waiting for OTP ({OTP_WAIT_SECONDS}s) — nobody was available to enter it."
    )


def _is_logged_in(page: Page, base_url: str) -> bool:
    """Best-effort check only - not fully reliable. The orders page can render
    its shell with a stale cookie and only discover the token is expired once
    a real authenticated API call fires (e.g. clicking Search), redirecting to
    /login well after this check passes. See SessionExpiredMidRun for the
    backstop that catches that case."""
    page.goto(f"{base_url}{ORDERS_PATH}", wait_until="domcontentloaded")
    try:
        page.wait_for_url(f"**{LOGIN_URL_MARKER}**", timeout=8000)
        return False  # got redirected to login -> session invalid/expired
    except PlaywrightTimeoutError:
        return True  # stayed on /orders -> session still valid


def _perform_login(page: Page, base_url: str, phone_number: str) -> None:
    page.goto(f"{base_url}{LOGIN_URL_MARKER}", wait_until="domcontentloaded")
    page.get_by_placeholder("Mobile number").fill(phone_number)
    page.get_by_role("button", name="Send OTP").click()
    _enter_otp(page)
    page.wait_for_url(lambda url: LOGIN_URL_MARKER not in url, timeout=60000)


def ensure_logged_in(context: BrowserContext, page: Page, config: dict, force: bool = False) -> None:
    """Reuse the saved session if valid; otherwise walk through phone+OTP login.

    force=True skips the (unreliable) validity check and logs in directly -
    used when a caller has already confirmed the session is dead, e.g. after
    catching SessionExpiredMidRun."""
    base_url = config["control_tower"]["base_url"]

    if not force and SESSION_STATE_PATH.exists() and _is_logged_in(page, base_url):
        print("Reusing saved session — no OTP needed.", flush=True)
        return

    print("Session expired or not found — logging in.", flush=True)
    phone_number = config["control_tower"]["phone_number"]
    if not phone_number:
        raise ValueError("control_tower.phone_number is empty in config.yaml")

    _perform_login(page, base_url, phone_number)

    SESSION_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    context.storage_state(path=str(SESSION_STATE_PATH))
    print(f"Session saved to {SESSION_STATE_PATH}", flush=True)
