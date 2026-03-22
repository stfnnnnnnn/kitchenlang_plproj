# 🍳 KitchenLang IDE

Welcome to the **KitchenLang IDE**! This is a custom Domain-Specific Language (DSL) and interactive compiler system built with React. It allows you to write, visualize, format, and simulate culinary recipes using code.

## ✨ Key Features
* **Dual Editors:** Write raw DSL code or use the drag-and-drop Visual Editor. Both modes sync automatically.
* **Live Compiler Pipeline:** View real-time Tokens, Abstract Syntax Tree (AST), Semantic Analysis, and CFG Derivations.
* **AST Code Formatter:** Instantly reformat messy text into perfectly indented, standardized code.
* **Virtual Machine:** Execute your recipes step-by-step in the integrated terminal.
* **File Management:** Save recipes to your browser's local storage or export them as `.kl` files.

---

## 🚀 How to Launch Locally

Follow these steps to run the KitchenLang IDE on your machine.

### Prerequisites
* **[Node.js](https://nodejs.org/)** (Version 18 or higher recommended)
* **[Visual Studio Code (VS Code)](https://code.visualstudio.com/)**

### Installation & Setup
1. **Open the Project:** Open VS Code, go to **File > Open Folder...**, and select the project root (the folder containing `package.json`).
2. **Open Terminal:** Open the integrated terminal (`Ctrl + ~` or `Cmd + ~`).
3. **Install Dependencies:** KitchenLang uses Node Package Manager (`npm`). Run the following command:
   ```bash
   npm install
   ```
4. **Start the Server:** Launch the Vite development server:
   ```bash
   npm run dev
   ```
5. **Open the App:** `Ctrl + Click` (or `Cmd + Click`) the `http://localhost:5173` link in the terminal to open the IDE in your browser.

---

## 🛠️ Troubleshooting

**"npm command not found"**
* This means Node.js is not installed correctly or isn't in your system's PATH. Restart VS Code or reinstall Node.js from the official website.

**"Port 5173 is already in use"**
* If you have another React/Vite project running, the terminal will automatically assign the next available port (like `localhost:5174`). Check the terminal output for the exact URL.