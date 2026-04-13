# Hackfest — Architectural Hunt Platform

Welcome to the Hackfest platform! This repository contains the source code for a gamified, treasure-hunt-style hackathon platform.

## Setup Instructions

### 1. Supabase Database Setup
Before the application can function, you must initialize your Supabase database with the required tables and logic:

1.  Log in to your [Supabase Dashboard](https://app.supabase.com/).
2.  Select your project: **supabase-bronze-lighthouse**.
3.  Go to the **SQL Editor** in the left sidebar.
4.  Copy the entire content of [schema.sql](schema.sql) from this repository.
5.  Paste it into the SQL Editor and click **Run**.

This will create:
-   **Tables**: `admins`, `teams`, `team_members`, `hackathons`, `rounds`, `questions`, `progress`, and `submissions`.
-   **Secure Functions**: `validate_answer` for server-side answer verification.
-   **RLS Policies**: Standard security policies to protect your data.

### 2. Add an Admin User
Once the schema is loaded, you need at least one admin to manage hackathons:
1.  In the Supabase Dashboard, go to **Table Editor**.
2.  Select the `admins` table.
3.  Insert a new row with your email address.
4.  (Optional) Setup Supabase Auth for this email to allow logging in through the UI.

### 3. Vercel Deployment
This project is built as a static site and is ready for Vercel:

1.  Connect your GitHub repository to **Vercel**.
2.  Vercel will automatically detect the project and deploy it.
3.  Ensure your `config.js` is updated with the correct `SUPABASE_URL` and `SUPABASE_ANON_KEY` (already done in this repo).

## Local Development
-   Open `index.html` in any browser.
-   The app will automatically fallback to **LocalStorage Mock** if the Supabase URL is not configured or if you are offline.
-   To force live mode, ensure `config.js` has your project's URL and Publishable key.

---
Built with ❤️ by [Satyaki Das](https://github.com/edusatyaki)
