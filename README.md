# ChatGPT Cleaner

ChatGPT Cleaner is a browser extension that helps you scan, filter, select, and bulk delete ChatGPT conversations from a simple popup interface.

The project is built with plain JavaScript, Manifest V3, and a small set of shared utility modules. There is no bundler, no framework, and no third-party UI dependency. The goal is to keep the extension straightforward to maintain and easy to understand.

## What It Does

- Scans conversations from ChatGPT using both API and sidebar data
- Filters chats by keyword, sort order, and archive state
- Lets you select individual chats from the popup
- Supports deleting selected chats
- Supports deleting all currently filtered chats
- Supports pause, resume, stop, and retry for deletion jobs
- Shows progress, counts, and current operation state in the popup

## Project Structure

```text
Extension/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── scripts/
│   ├── api.js
│   ├── background.js
│   ├── content.js
│   ├── deletion.js
│   ├── export.js
│   ├── filters.js
│   ├── logger.js
│   ├── observer.js
│   ├── queue.js
│   ├── selectors.js
│   ├── state.js
│   ├── storage.js
│   └── utils.js
├── styles/
│   └── shared.css
├── assets/
│   └── icons/
└── README.md
```

## How The Extension Works

### Popup

The popup is the control panel. It shows conversation stats, current filters, the list of visible chats, and the main actions like scan, delete, delete all, pause, resume, stop, clear, invert filtered, and retry failed.

### Content Script

`scripts/content.js` is the main controller that runs on the ChatGPT page. It handles scanning, selection, syncing runtime state, and coordinating delete operations.

### Background Script

`scripts/background.js` handles extension-level work such as saved state snapshots, downloads, and notifications that should not depend on the popup staying open.

### Shared Modules

- `api.js` handles API requests used to read or delete conversations
- `selectors.js` keeps UI selectors in one place for DOM fallback work
- `queue.js` manages batch processing, retry logic, pause, resume, and stop
- `storage.js` keeps settings and runtime state clean before saving them
- `filters.js` applies the popup filters to the conversation list

## Installation

### Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this project folder, or `build/chrome` after running `scripts/prepare-browser-builds.sh`
5. Open `https://chatgpt.com/` in a logged-in tab
6. Click the extension icon to open the popup

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Run `scripts/prepare-browser-builds.sh`
3. Click `Load Temporary Add-on`
4. Choose `build/firefox/manifest.json`
5. Do not choose the root `manifest.json`, because Firefox will reject the Chrome service worker manifest
6. Open `https://chatgpt.com/` in a logged-in tab
7. Click the extension icon to use it

## Usage

### Basic Flow

1. Open ChatGPT in the active browser tab
2. Open the extension popup
3. Click `Scan`
4. Use keyword, sort, or archive filters if needed
5. Select the chats you want to remove
6. Click `Delete`
7. Confirm the delete action

### Delete All Filtered Chats

1. Run a scan first
2. Apply the filters you want
3. Click `Delete all`
4. The extension will select all visible filtered chats
5. Confirm the delete action

### Operation Controls

- `Pause` temporarily pauses the running delete job
- `Resume` continues a paused job
- `Stop` cancels the running job as safely as possible
- `Retry failed` reruns only the conversations that failed in the previous delete job

## Current Popup Actions

- `Scan`
- `Pause`
- `Resume`
- `Delete`
- `Delete all`
- `Stop`
- `Invert filtered`
- `Clear`
- `Retry failed`

## Developer Notes

### Scan Strategy

The extension does not rely on only one source of truth. It reads conversation data from the internal ChatGPT web API when available, and it also scans the sidebar DOM to catch what is visible on screen. The two sources are merged so the extension stays useful even if one source is incomplete.

### Delete Strategy

Delete jobs are processed through the queue system in `queue.js`. That gives the extension controlled pacing, retry support, and the ability to pause or stop a running job without freezing the UI.

### Selector Maintenance

If ChatGPT changes its layout, `scripts/selectors.js` is the first place to review. The selector registry is intentionally centralized so UI breakages are easier to fix.

## Troubleshooting

### The popup says to open ChatGPT in the active tab

Make sure the currently focused tab is `chatgpt.com` and that you are logged in.

### Scan finds fewer chats than expected

Run the scan again after the ChatGPT sidebar has had a moment to settle. The extension already scrolls the sidebar to collect lazy-loaded rows, but ChatGPT can still behave inconsistently when the page is under load.

### Delete is disabled

`Delete` only becomes active when at least one conversation is selected and no delete job is currently running or paused.

### Delete all is disabled

`Delete all` needs at least one visible chat after filters are applied. If the current filter returns zero chats, the button stays disabled.

### UI fallback stops working

ChatGPT may have changed menu labels or structure. Review and update the selector list in `scripts/selectors.js`.

## Local Development Process

1. Make changes in the extension files
2. Reload the extension from the browser extensions page
3. Refresh the ChatGPT tab
4. Open the popup and test the affected flow
5. If the change touches scanning or deletion, test with a small set of chats first

## Security And Scope

- No external server is required
- No third-party runtime library is required
- Data stays inside the extension and the active ChatGPT session
- Permissions are limited to the ChatGPT-related pages the extension needs

## Footer

<p align="center"><strong><em>© Code and crafted by Prabhakar Singh</em></strong></p>
