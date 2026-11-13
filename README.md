# ChatGPT Cleaner

**A lightweight, zero-dependency browser extension to take control of your ChatGPT history.**

If you use ChatGPT frequently, your sidebar is likely cluttered with hundreds of old, untitled, or abandoned conversations. **ChatGPT Cleaner** is a simple, open-source tool that lets you scan, filter, and bulk-delete your ChatGPT history directly from a clean popup interface. 

Built entirely with vanilla JavaScript and Manifest V3, it’s fast, secure, and completely private.

## 🚀 Installation

🦊 **Firefox**  
The extension is officially published! You can install it directly from the store:  
👉 **[Install from Firefox Add-ons](#)** *(https://addons.mozilla.org/en-US/firefox/addon/chatgpt-cleaner/)*

🌐 **Chrome / Edge (Coming Soon to Web Store)**  
For now, you can load it manually:
1. Download or clone this repository.
2. Go to `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `Extension/` folder.

---

## ✨ What It Does

*   **Bulk Management:** Select specific chats or instantly select all filtered chats for deletion.
*   **Smart Scanning:** Checks both the internal API and the visible sidebar so no chats are missed.
*   **Advanced Filtering:** Find exactly what you want to delete by keyword, sort order, or archive state.
*   **Safe & Controlled:** Pause, resume, or stop a running delete job at any time without freezing your browser. 
*   **Privacy First:** Everything stays inside your browser. No external servers, no tracking.

---

## 🛠️ How to Use It

1. Open [ChatGPT](https://chatgpt.com/) and click the extension icon.
2. Click **Scan** to gather your history.
3. Type a keyword or use the dropdowns to **Filter** the list.
4. Select the chats you want gone (or hit "Select All").
5. Click **Delete** and watch it clean up your sidebar!

---

## 💻 For Developers & Contributors

I built this extension to be as transparent and maintainable as possible. There are no heavy frameworks, no third-party UI libraries, and **no bundlers required** to run the core code. 

*   **Hybrid Scanning:** Merges data from ChatGPT's web API and DOM parsing to survive frontend layout changes.
*   **Queue System:** Deletions are processed via `queue.js` to prevent rate-limiting.
*   **Centralized Selectors:** All DOM targets are kept in `selectors.js` for easy updates if ChatGPT changes its UI.

**Want to contribute?** 
Contributions are highly welcome! Just clone the repo, make your changes directly in the JS files, and reload the extension in your browser to test. No build steps needed.

---

<p align="center"><strong><em>© Code and crafted by Prabhakar Singh</em></strong></p>
