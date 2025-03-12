# Team Generator with Discord Authentication

## Overview

This project is a web application that allows users to create and balance teams based on player skill ratings. The application is built with **Vite + React (TypeScript) for the frontend** and **Node.js + Express (TypeScript) with SQLite for the backend**, all containerized using **Docker** and served through an **Nginx reverse proxy**. Users authenticate via **Discord OAuth2**, using their Discord username within the application. The platform supports **English (default) and French**.

## Features

### **Authentication & User Management**

-   Login via **Discord OAuth2**.
-   **Persistent user sessions** to reduce frequent reauthentication.
-   Uses **Discord username and avatar**.
-   **GDPR (RGPD) compliance**:
    -   Users are informed about data collection.
    -   A **cookie consent banner** is implemented.
    -   Minimal data storage, only necessary for functionality.
    -   Users can **request data deletion**.

### **Player Management**

-   Users can **create and manage their player list**.
-   Players have a **name and a skill rating (1-5)**.
-   Users can **select players from their saved list** or add **temporary players**.
-   Temporary players are **not stored** in the database.

### **Team Creation & Balancing**

-   Users can **specify the number of players per team** (must be even).
-   Assign **custom team names**.
-   Teams are balanced using **custom algorithms**:
    -   **Default**: Balance teams by skill rating.
    -   **Future Extension**: Improve matchmaking using match history (SBMM-style).
-   Users can **manually adjust teams**.
-   Quickly **generate or reroll team compositions**.

### **Match History & Result Tracking**

-   Every generated team set is stored as match history.
-   Users can mark a match as:
    -   **Won**
    -   **Lost**
    -   **Unknown** (if no result is recorded)
-   View past matches and the teams that were formed.

### **Localization (English & French)**

-   Default language: **English**, but users can switch to **French**.
-   Uses **i18n for structured language files**.

### **User Experience (UX)**

-   **Fast & Efficient**: Users can create and balance teams with minimal friction.
-   **Intuitive UI**: Selecting players, adjusting teams, and confirming results is straightforward.
-   **Real-time Feedback**: Immediate updates when modifying teams or selecting players.
-   **Keyboard & Mouse Optimized**.

## **Technical Stack**

### **Frontend**

-   **Vite + React + TypeScript**
-   **Tailwind CSS** for styling
-   **i18n** for localization
-   **React Context API** for state management (instead of Redux)

### **Backend**

-   **Node.js + Express + TypeScript**
-   **Passport.js (Discord OAuth2)**
-   **JWT for session management**
-   **SQLite** for data storage
-   **Prisma ORM** (optional)

### **Infrastructure & Deployment**

-   **Docker** for containerization
-   **Nginx** as a reverse proxy
-   **Docker Compose** for service orchestration

## **Database Schema (SQLite)**

### **Users Table**

| Field    | Type | Description              |
| -------- | ---- | ------------------------ |
| id       | TEXT | Discord ID (Primary Key) |
| username | TEXT | Discord Username         |
| avatar   | TEXT | Avatar URL               |

### **Players Table**

| Field   | Type    | Description                        |
| ------- | ------- | ---------------------------------- |
| id      | INTEGER | Primary Key                        |
| user_id | TEXT    | Foreign Key (Users) - Player owner |
| name    | TEXT    | Player's name                      |
| skill   | INTEGER | Skill rating (1-5)                 |

### **Matches Table**

| Field   | Type    | Description                    |
| ------- | ------- | ------------------------------ |
| id      | INTEGER | Primary Key                    |
| user_id | TEXT    | Foreign Key (Users)            |
| teamA   | TEXT    | JSON string of team A players  |
| teamB   | TEXT    | JSON string of team B players  |
| winner  | TEXT    | 'teamA', 'teamB', or 'unknown' |

## **API Endpoints**

### **Authentication**

-   `GET /api/auth/discord` → Redirect to Discord OAuth2
-   `GET /api/auth/discord/callback` → Handle OAuth2 callback
-   `GET /api/user` → Get authenticated user
-   `DELETE /api/user` → Request data deletion (GDPR compliance)

### **Player Management**

-   `POST /api/players` → Add a new player
-   `GET /api/players` → Retrieve player list
-   `DELETE /api/players/:id` → Remove a player

### **Match Management**

-   `POST /api/matches` → Save match result
-   `GET /api/matches` → Retrieve match history
-   `PATCH /api/matches/:id` → Update match result

## **Future Features**

1. **SBMM (Skill-Based Matchmaking)**: Future implementation where the system learns from previous matches.
2. **Integration with Discord Bot**: Allow interaction directly via Discord.
3. **Team Voting System**: Team members can confirm if generated teams feel balanced.
4. **Live Match Tracking**: Track ongoing matches and scores.

## **Next Steps**

✅ **Confirm feature set and architecture**  
🚀 **Develop MVP with essential functionalities**  
🛡️ **Implement GDPR-compliant data handling & cookie consent**  
📈 **Iterate & expand with additional features**

---

This document serves as the blueprint for the project's development. Contributions and feedback are welcome! 🚀
