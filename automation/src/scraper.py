"""Store selection + CSV export from the control-tower.loadshare.net Orders page.

The store multi-select and city dropdown are visually similar custom widgets with
no stable CSS classes or data-testid attributes, so element lookup below is done
via page.evaluate() against DOM structure/text that was verified by hand:
  - the filter bar is a 6-child flex row: [date, city, store, order-id, search, download]
  - the store box is always filterRow.children[2] regardless of what's selected
  - dropdown options are `<span>CODE</span>` inside the open `z-[110]` panel
"""

import datetime as dt
from pathlib import Path

from playwright.sync_api import Page

from .auth import LOGIN_URL_MARKER, SessionExpiredMidRun
from .config import DOWNLOADS_DIR

_OPEN_STORE_DROPDOWN_JS = """
() => {
    const dateInput = document.querySelector("input[type='date']");
    const filterRow = dateInput.closest('div').parentElement;
    const storeBox = filterRow.children[2];
    const chevron = storeBox.querySelector('svg.lucide-chevron-down');
    if (!chevron) throw new Error('store dropdown chevron not found');
    chevron.closest('button').click();
}
"""

_CLEAR_ALL_STORES_JS = """
() => {
    const dateInput = document.querySelector("input[type='date']");
    const filterRow = dateInput.closest('div').parentElement;
    const storeBox = filterRow.children[2];
    const clearIcon = storeBox.querySelector('svg.lucide-circle-x');
    if (clearIcon) clearIcon.closest('button').click();
}
"""

_SELECT_STORE_JS = """
(code) => {
    const panel = [...document.querySelectorAll('div')].find(
        d => typeof d.className === 'string' && d.className.includes('z-[110]')
    );
    if (!panel) throw new Error('store dropdown panel not open');
    const opt = [...panel.querySelectorAll('span')].find(s => s.textContent.trim() === code);
    if (!opt) throw new Error('store option not found in dropdown: ' + code);
    opt.click();
}
"""

_SELECTED_STORE_CODES_JS = """
() => {
    const dateInput = document.querySelector("input[type='date']");
    const filterRow = dateInput.closest('div').parentElement;
    const storeBox = filterRow.children[2];
    return [...storeBox.querySelectorAll('span')]
        .filter(s => typeof s.className === 'string' && s.className.includes('rounded-full'))
        .map(s => s.childNodes[0].textContent.trim());
}
"""


def _select_stores(page: Page, store_codes: list[str]) -> None:
    page.evaluate(_CLEAR_ALL_STORES_JS)
    page.wait_for_timeout(300)
    page.evaluate(_OPEN_STORE_DROPDOWN_JS)
    page.wait_for_timeout(300)
    for code in store_codes:
        page.evaluate(_SELECT_STORE_JS, code)
        page.wait_for_timeout(200)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    selected = set(page.evaluate(_SELECTED_STORE_CODES_JS))
    missing = set(store_codes) - selected
    if missing:
        raise RuntimeError(
            f"Failed to select stores: {missing}. "
            "The site's store-filter DOM structure may have changed (see src/scraper.py)."
        )


def _set_date(page: Page, target_date: dt.date) -> str:
    date_str = target_date.isoformat()
    page.locator("input[type='date']").fill(date_str)
    return date_str


def _export_batch(page: Page, store_codes: list[str], out_path: Path) -> Path:
    _select_stores(page, store_codes)
    page.get_by_role("button", name="Search", exact=True).click()
    page.wait_for_timeout(1000)  # let the filtered totals settle before export

    if LOGIN_URL_MARKER in page.url:
        raise SessionExpiredMidRun(
            "Redirected to login after clicking Search — the saved session's "
            "token had actually expired despite passing the startup check."
        )

    with page.expect_download(timeout=60000) as download_info:
        page.get_by_role("button", name="Download orders").click()
    download = download_info.value
    out_path.parent.mkdir(parents=True, exist_ok=True)
    download.save_as(str(out_path))
    return out_path


def export_orders(page: Page, config: dict, target_date: dt.date | None = None) -> tuple[Path, Path]:
    """Navigate to Orders, set the target date (defaults to today), and export
    both store batches as CSVs."""
    if target_date is None:
        target_date = dt.date.today()

    base_url = config["control_tower"]["base_url"]
    page.goto(f"{base_url}/orders", wait_until="domcontentloaded")

    date_str = _set_date(page, target_date)

    batch_a = config["stores"]["batch_a"]
    batch_b = config["stores"]["batch_b"]

    batch_a_path = DOWNLOADS_DIR / f"batch_a_{date_str}.csv"
    batch_b_path = DOWNLOADS_DIR / f"batch_b_{date_str}.csv"

    _export_batch(page, batch_a, batch_a_path)
    _export_batch(page, batch_b, batch_b_path)

    return batch_a_path, batch_b_path
