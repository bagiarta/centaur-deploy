# How to Run the Project Locally

This guide explains how to run this Vite + React project on your local PC.

## Prerequisites

1. **Node.js**: Ensure you have Node.js installed. It's recommended to use the latest LTS version (e.g., v18 or v20+).
   - Download from: [Node.js Official Website](https://nodejs.org/)
2. **Package Manager**: `npm` comes pre-installed with Node.js.

## Setup & Running Instructions

Follow these steps to get the project up and running:

1. **Open your terminal or command prompt** (e.g., PowerShell) and navigate to the project folder:
   ```powershell
   cd f:\PepiUpdater\centaur-deploy
   ```

2. **Install Dependencies**:
   Run the following command to download all required node packages. You only need to do this the first time or when new dependencies are added to `package.json`.
   ```powershell
   npm install
   ```

3. **Start the Development Server**:
   Once the installation is complete, start the local Vite development server:
   ```powershell
   npm run dev
   ```

4. **Access the Application**:
   Open a web browser and navigate to the local server address provided in the terminal output. By default, it runs on:
   ```
   http://localhost:8080/
   ```
   *(Note: If port 8080 is in use, Vite might assign a different port like 8081. Check the terminal output for the exact URL)*.

## Stopping the Server
To stop the development server, press `Ctrl + C` in your terminal.
