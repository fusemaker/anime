# 🎯 Event Management Chatbot

An enterprise-grade **AI-Powered Event Management Chatbot** featuring secure authentication, intelligent event discovery, interactive mapping, and automated reminders. Built with modern web technologies and AI-driven interactions.

---

## ✨ Features

### 🤖 **AI-Powered Chatbot**
- **OpenRouter AI Integration**: All responses dynamically generated using OpenRouter API
- **Natural Language Processing**: Understands user intent (create, discover, register, remind)
- **Context-Aware Conversations**: Maintains conversation context across interactions
- **Multi-Intent Detection**: Handles complex queries with multiple intents
- **Real Data Only**: Strictly uses real event data from web scraping (no placeholders or fake data)

### 🔐 **Authentication & Security**
- **JWT-Based Authentication**: Secure token-based authentication
- **Bcrypt Password Hashing**: Industry-standard password encryption
- **Session Management**: Persistent conversation sessions
- **User Profile Management**: Secure user data storage

### 🎪 **Event Management**
- **Event Discovery**: Find events by location, category, date, or keyword
- **Event Creation**: Create events with AI-assisted detail extraction
- **Event Registration**: Register for events with confirmation
- **Event CRUD Operations**: Full Create, Read, Update, Delete capabilities
- **Event Statistics**: View event analytics and statistics
- **Event Sidebar**: Interactive sidebar to view, filter, and manage events

### 🗺️ **Interactive Maps**
- **Full-Page Map View**: Real-time event visualization on interactive maps
- **Marker Clustering**: Efficient display of multiple events
- **Location Detection**: Automatic user location detection
- **Route Planning**: Get directions to events using OSRM routing
- **OpenStreetMap Integration**: Free and open map tiles

### 🔔 **Smart Reminders & Real-Time Notifications**
- **Automated Reminders**: Set reminders for upcoming events
- **Cron Job Scheduling**: Automated reminder notifications (hourly)
- **Real-Time Email Notifications**: NodeMailer integration for instant email notifications
- **24-Hour Reminders**: Automatic "remind me later" notifications
- **Past Event Reminders**: Daily reminders for events you attended
- **Event Action Notifications**: Instant emails for signup, registration, save, and remind actions

### 📍 **Location Services**
- **Geoapify Integration**: Location geocoding and reverse geocoding
- **IPInfo Integration**: IP-based location detection
- **Browser Geolocation**: User location permission handling

### 🔍 **Web Search Integration**
- **SerpAPI (Primary)**: Real-time web search for event discovery
- **Serper API (Fallback)**: Backup search API for reliability
- **Real Event Data**: Extracts actual event information from web results
- **Top 5 Snippets & Links**: Curated event information display

### 💬 **User Experience**
- **Dynamic Suggestions**: Context-aware conversation suggestions
- **Mobile Responsive**: Works on desktop, tablet, and mobile
- **Real-Time Updates**: Live event updates and notifications
- **Loading States**: Smooth loading indicators
- **Error Handling**: Graceful error handling with user-friendly messages

---

## 🛠️ Tech Stack

### **Backend**
| Technology | Purpose | Version |
|------------|---------|---------|
| **Node.js** | Runtime Environment | Latest |
| **Express.js** | Web Framework | ^4.18.2 |
| **MongoDB** | Database | Latest |
| **Mongoose** | ODM (Object Data Modeling) | ^8.0.3 |
| **JWT (jsonwebtoken)** | Authentication | ^9.0.2 |
| **bcryptjs** | Password Hashing | ^2.4.3 |
| **Axios** | HTTP Client | ^1.6.2 |
| **dotenv** | Environment Variables | ^16.3.1 |
| **node-cron** | Task Scheduling | ^4.2.1 |
| **express-validator** | Input Validation | ^7.0.1 |
| **cors** | Cross-Origin Resource Sharing | ^2.8.5 |
| **@mailchimp/mailchimp_marketing** | Email Marketing | ^3.0.80 |

### **Frontend**
| Technology | Purpose | Version |
|------------|---------|---------|
| **React** | UI Framework | ^18.2.0 |
| **React Router DOM** | Client-Side Routing | ^7.12.0 |
| **Styled Components** | CSS-in-JS Styling | ^6.1.1 |
| **React-Leaflet** | Map Component | ^4.2.1 |
| **Leaflet** | Map Library | ^1.9.4 |
| **Leaflet.markercluster** | Marker Clustering | ^1.5.3 |
| **Axios** | HTTP Client | ^1.6.2 |
| **React Scripts** | Build Tools | 5.0.1 |

### **External APIs & Services**
| Service | Purpose | API Used |
|---------|---------|----------|
| **OpenRouter** | AI Response Generation | GPT Models |
| **SerpAPI** | Web Search (Primary) | Google Search API |
| **Serper API** | Web Search (Fallback) | Google Search API |
| **Geoapify** | Geocoding & Maps | Geoapify API |
| **IPInfo** | IP-Based Location | IPInfo API |
| **OSRM** | Route Planning | Open Source Routing |
| **Mailchimp** | Email Marketing | Mailchimp API |

---

## 📁 Project Structure

```
event-management-chatbot/
│
├── src/                          # Backend Source Code
│   ├── config/                   # Configuration Files
│   │   ├── db.js                # MongoDB Connection
│   │   └── env.js               # Environment Variables
│   │
│   ├── controllers/              # Request Handlers
│   │   ├── authController.js    # Authentication Logic
│   │   ├── chatController.js    # Chat/Conversation Logic
│   │   └── eventController.js   # Event Management Logic
│   │
│   ├── middleware/               # Express Middleware
│   │   └── auth.js              # JWT Authentication Middleware
│   │
│   ├── models/                   # Database Schemas (Mongoose)
│   │   ├── User.js              # User Schema
│   │   ├── Event.js             # Event Schema
│   │   ├── Conversation.js      # Conversation Schema
│   │   ├── Registration.js      # Registration Schema
│   │   ├── Reminder.js          # Reminder Schema
│   │   └── Feedback.js          # Feedback Schema
│   │
│   ├── routes/                   # API Routes
│   │   ├── auth.js              # Authentication Routes
│   │   ├── chat.js              # Chat Routes
│   │   └── events.js            # Event Routes
│   │
│   ├── services/                 # Business Logic Services
│   │   ├── llmService.js        # OpenRouter AI Integration
│   │   ├── serperService.js     # Web Search (SerpAPI/Serper)
│   │   ├── locationService.js   # Location Services (Geoapify/IPInfo)
│   │   ├── eventService.js      # Event Business Logic
│   │   ├── authService.js       # Authentication Logic
│   │   ├── reminderService.js   # Reminder Management
│   │   ├── reminderCron.js      # Automated Reminder Cron Job
│   │   ├── mailchimpService.js  # Email Marketing
│   │   ├── intentService.js     # Intent Detection
│   │   └── aiExtractionService.js # AI Data Extraction
│   │
│   ├── utils/                    # Utility Functions
│   │   ├── logger.js            # Logging Utility
│   │   ├── validator.js         # Input Validation
│   │   └── viewDatabase.js      # Database Viewer
│   │
│   ├── app.js                    # Express App Configuration
│   └── server.js                 # Server Entry Point
│
├── frontend/                     # Frontend Source Code
│   ├── public/                   # Static Assets
│   │   └── index.html           # HTML Template
│   │
│   ├── src/                      # React Source Code
│   │   ├── components/          # React Components
│   │   │   ├── ChatBot.jsx     # Main Chatbot Component
│   │   │   ├── EventSidebar.jsx # Event Sidebar Component
│   │   │   ├── InteractiveMap.jsx # Map Component
│   │   │   ├── LoginPopup.jsx  # Login Component
│   │   │   └── SignupPopup.jsx # Signup Component
│   │   │
│   │   ├── utils/               # Frontend Utilities
│   │   │   └── axiosConfig.js  # Axios Configuration
│   │   │
│   │   ├── App.js               # Main App Component
│   │   ├── App.css              # Global Styles
│   │   └── index.js             # React Entry Point
│   │
│   ├── scripts/                  # Build Scripts
│   │   └── start.js             # Custom Start Script
│   │
│   ├── package.json              # Frontend Dependencies
│   └── package-lock.json         # Lock File
│
├── .env                          # Environment Variables (Create This)
├── .gitignore                    # Git Ignore File
├── package.json                  # Backend Dependencies
├── package-lock.json             # Lock File
└── README.md                     # This File

```

---

## 🔌 API Endpoints

### **Authentication** (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/auth/signup` | Register a new user | ❌ No |
| `POST` | `/api/auth/login` | Authenticate user and get JWT token | ❌ No |

**Request Body (Signup):**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "confirmPassword": "securePassword123"
}
```

**Request Body (Login):**
```json
{
  "username": "john_doe",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id",
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

---

### **Chat** (`/api/chat`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/chat` | Send message to chatbot | ✅ Yes |

**Request Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Request Body:**
```json
{
  "message": "Find tech conferences in New York",
  "sessionId": "session_id" // Optional, auto-generated if not provided
}
```

**Response:**
```json
{
  "success": true,
  "reply": "I found several tech conferences in New York...",
  "sessionId": "session_id",
  "refreshEvents": false, // true if events should be refreshed in sidebar
  "suggestions": ["View on Map", "Register for Event"]
}
```

---

### **Events** (`/api/events`)

All event routes require authentication.

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/events` | Get events with filters | ✅ Yes |
| `GET` | `/api/events/stats` | Get event statistics | ✅ Yes |
| `GET` | `/api/events/:id` | Get single event by ID | ✅ Yes |
| `POST` | `/api/events` | Create new event | ✅ Yes |
| `PUT` | `/api/events/:id` | Update existing event | ✅ Yes |
| `DELETE` | `/api/events/:id` | Delete event | ✅ Yes |

**Query Parameters (GET /api/events):**
- `filter`: `'discovery'` | `'created'` | `'registered'` (default: all)
- `location`: Location filter (e.g., "New York")
- `category`: Category filter
- `limit`: Number of results (default: 50)
- `skip`: Pagination offset

**Request Body (POST /api/events):**
```json
{
  "title": "Tech Conference 2025",
  "startDate": "2025-06-15T10:00:00.000Z",
  "location": "New York, USA",
  "category": "Technology",
  "mode": "offline",
  "price": "Free",
  "source": "user_created",
  "userId": "user_id"
}
```

---

### **System**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/health` | Health check endpoint | ❌ No |

**Response:**
```json
{
  "status": "ok",
  "message": "Event Management Chatbot API"
}
```

---

## 🔑 API Keys & External Services

### **Required API Keys**

Create a `.env` file in the root directory with the following keys:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name

# Authentication
JWT_SECRET=your_super_secret_jwt_key_here

# AI Services
OPENROUTER_API_KEY=sk-or-v1-your_openrouter_api_key_here

# Search APIs (Primary: SerpAPI, Fallback: Serper)
SERP_API_KEY=70af1cc6113c8d045ffb38a7d13abcabb1713eac120843a720acc01866edac5d
SERPER_API_KEY=your_serper_api_key_here

# Location Services
GEOAPIFY_API_KEY=your_geoapify_api_key_here
IPINFO_TOKEN=6d1579279c208889d19285c6a1f5a7d731c8f42c

# Email Marketing (Optional)
MAILCHIMP_API_KEY=your_mailchimp_api_key_here
```

### **API Key Sources**

1. **OpenRouter API Key**
   - Sign up at: https://openrouter.ai/
   - Used for: AI response generation

2. **SerpAPI Key**
   - Sign up at: https://serpapi.com/
   - Used for: Web search (primary search engine)

3. **Serper API Key**
   - Sign up at: https://serper.dev/
   - Used for: Web search (fallback when SerpAPI fails)

4. **Geoapify API Key**
   - Sign up at: https://www.geoapify.com/
   - Used for: Geocoding and reverse geocoding

5. **IPInfo Token**
   - Sign up at: https://ipinfo.io/
   - Used for: IP-based location detection

6. **MongoDB Connection String**
   - Sign up at: https://www.mongodb.com/cloud/atlas
   - Used for: Database storage

7. **Mailchimp API Key** (Optional)
   - Sign up at: https://mailchimp.com/
   - Used for: Email marketing and notifications

---

## 🔄 How It Works / Flow

### **System Architecture Flow**

```mermaid
graph TB
    subgraph User["👤 User"]
        Browser[Web Browser]
    end

    subgraph Frontend["💻 Frontend (React)"]
        UI[User Interface]
        Chat[ChatBot Component]
        Map[Interactive Map]
        Auth[Auth Components]
        Sidebar[Event Sidebar]
    end

    subgraph Backend["⚙️ Backend (Node.js/Express)"]
        API[API Routes]
        AuthCtrl[Auth Controller]
        ChatCtrl[Chat Controller]
        EventCtrl[Event Controller]
        Middleware[Auth Middleware]
    end

    subgraph Services["🔧 Services Layer"]
        LLM[LLM Service<br/>OpenRouter AI]
        Search[Search Service<br/>SerpAPI/Serper]
        Location[Location Service<br/>Geoapify/IPInfo]
        EventSvc[Event Service]
        Reminder[Reminder Service]
        Cron[Cron Job<br/>Reminders]
    end

    subgraph Database["🗄️ Database (MongoDB)"]
        Users[(Users Collection)]
        Events[(Events Collection)]
        Conversations[(Conversations Collection)]
        Registrations[(Registrations Collection)]
        Reminders[(Reminders Collection)]
    end

    subgraph External["☁️ External APIs"]
        OpenRouter[OpenRouter AI]
        SerpAPI[SerpAPI Search]
        Serper[Serper API]
        Geoapify[Geoapify Maps]
        IPInfo[IPInfo Location]
        OSRM[OSRM Routing]
    end

    %% User Interactions
    Browser -->|Login/Signup| Auth
    Browser -->|Chat Messages| Chat
    Browser -->|Map Interaction| Map
    Browser -->|Event Management| Sidebar

    %% Frontend to Backend
    Auth -->|POST /api/auth/*| API
    Chat -->|POST /api/chat| API
    Map -->|GET /api/events| API
    Sidebar -->|GET /api/events| API

    %% Backend Routing
    API -->|Authenticate| AuthCtrl
    API -->|Process Message| ChatCtrl
    API -->|Manage Events| EventCtrl
    API -->|JWT Validation| Middleware

    %% Services Integration
    ChatCtrl -->|Generate Response| LLM
    ChatCtrl -->|Search Events| Search
    ChatCtrl -->|Get Location| Location
    ChatCtrl -->|Manage Events| EventSvc
    ChatCtrl -->|Set Reminders| Reminder
    EventCtrl -->|CRUD Operations| EventSvc
    Reminder -->|Schedule| Cron

    %% External API Calls
    LLM -->|API Request| OpenRouter
    Search -->|Primary| SerpAPI
    Search -->|Fallback| Serper
    Location -->|Geocoding| Geoapify
    Location -->|IP Lookup| IPInfo
    Map -->|Route Planning| OSRM

    %% Database Operations
    AuthCtrl <-->|Store/Fetch| Users
    ChatCtrl <-->|Store/Fetch| Conversations
    EventCtrl <-->|Store/Fetch| Events
    EventCtrl <-->|Store/Fetch| Registrations
    Reminder <-->|Store/Fetch| Reminders
    Cron -->|Send Reminders| Reminders

    style User fill:#e1f5ff
    style Frontend fill:#fff4e6
    style Backend fill:#f3e5f5
    style Services fill:#e8f5e9
    style Database fill:#fff3e0
    style External fill:#fce4ec
```

### **User Flow: Event Discovery**

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant AI as OpenRouter AI
    participant S as Search API
    participant DB as Database

    U->>F: "Find tech conferences in New York"
    F->>B: POST /api/chat (with JWT token)
    B->>B: Authenticate User
    B->>AI: Detect Intent (discovery)
    AI-->>B: Intent: "discovery"
    B->>S: Search for "tech conferences New York"
    S-->>B: Return event results
    B->>AI: Generate response with event data
    AI-->>B: Formatted response
    B->>DB: Store conversation
    B-->>F: Return response + events
    F-->>U: Display events + map link
    U->>F: Click "View on Map"
    F->>F: Navigate to /events-map
    F->>B: GET /api/events?filter=discovery&location=New York
    B-->>F: Return events with coordinates
    F-->>U: Display events on map
```

### **User Flow: Event Creation**

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant AI as OpenRouter AI
    participant S as Search API
    participant DB as Database

    U->>F: "Create event: Tech Summit 2025"
    F->>B: POST /api/chat
    B->>AI: Detect Intent (create)
    AI-->>B: Intent: "create", Title: "Tech Summit 2025"
    B->>S: Search for event details
    S-->>B: Return event info (date, location, etc.)
    B->>AI: Extract event details from search results
    AI-->>B: Extracted details (date, time, location)
    B->>AI: Generate event card preview
    AI-->>B: Formatted event card
    B-->>F: Show event preview + confirmation
    F-->>U: Display event card + "Proceed or Edit?"
    U->>F: "Yes, create it"
    F->>B: POST /api/chat (confirmation)
    B->>DB: Create event
    DB-->>B: Event created
    B-->>F: Success + event card
    F-->>U: Display success + sidebar update
```

### **User Flow: Authentication**

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend
    participant DB as Database

    U->>F: Enter credentials (signup/login)
    F->>B: POST /api/auth/signup or /login
    B->>B: Validate input
    
    alt Signup
        B->>DB: Check if user exists
        DB-->>B: User not found
        B->>B: Hash password (bcrypt)
        B->>DB: Create user
        DB-->>B: User created
    else Login
        B->>DB: Find user
        DB-->>B: User found
        B->>B: Verify password (bcrypt)
    end
    
    B->>B: Generate JWT token
    B-->>F: Return token + user data
    F->>F: Store token in localStorage
    F-->>U: Redirect to chatbot
```

---

## 📦 Installation & Setup

### **Prerequisites**

- **Node.js** (v16 or higher)
- **npm** (v8 or higher)
- **MongoDB** (Cloud Atlas or local instance)
- **API Keys** (See API Keys section above)

### **Step 1: Clone Repository**

```bash
git clone <repository-url>
cd event-management-chatbot
```

### **Step 2: Install Backend Dependencies**

```bash
npm install
```

### **Step 3: Install Frontend Dependencies**

```bash
cd frontend
npm install
cd ..
```

### **Step 4: Configure Environment Variables**

Create a `.env` file in the root directory:

```bash
# Copy the example (if exists) or create new
touch .env
```

Add all required environment variables (see API Keys section above).

### **Step 5: Run Development Server**

Start both backend and frontend concurrently:

```bash
npm run dev
```

This will:
- Start backend server on `http://localhost:3000`
- Start frontend React app on `http://localhost:3010`

### **Alternative: Run Separately**

**Backend only:**
```bash
npm run server
```

**Frontend only:**
```bash
npm run client
```

### **Step 6: Access Application**

- **Frontend**: http://localhost:3010
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

---

## 🎯 Usage Examples

### **1. User Registration & Login**

```
1. Open http://localhost:3010
2. Click "Sign Up"
3. Enter username, email, password
4. Submit → Automatically logged in
```

### **2. Discover Events**

**Chat Examples:**
- "Find tech conferences in New York"
- "Show events near me"
- "What events are happening this weekend?"
- "Find music concerts in London"

### **3. Create Event**

**Chat Examples:**
- "Create event: Tech Summit 2025"
- "I want to create a conference"
- "Add new event: Summer Festival"

**Flow:**
1. User requests event creation
2. Bot searches web for event details
3. Bot shows preview with extracted info
4. User confirms or edits
5. Event created and saved to database

### **4. Register for Event**

**Chat Examples:**
- "Register for [Event Name]"
- "I want to attend [Event Name]"
- "Sign me up for the conference"

### **5. Set Reminders**

**Chat Examples:**
- "Remind me about [Event Name]"
- "Set a reminder for the conference"
- "Notify me before [Event Name]"

### **6. View Events on Map**

1. Discover events via chat
2. Click "View on Map" suggestion
3. Events displayed on interactive map
4. Click markers for event details
5. Get directions using "Directions" button

### **7. Manage Events via Sidebar**

- View all events (Created, Registered, Discovery)
- Filter by location, category, date
- Delete events
- Navigate to map view

---

## 🗄️ Database Schema

### **User Model**
```javascript
{
  username: String (required, unique),
  email: String (required, unique),
  password: String (required, hashed),
  createdAt: Date,
  updatedAt: Date
}
```

### **Event Model**
```javascript
{
  title: String (required),
  startDate: Date,
  location: String,
  category: String,
  mode: String (enum: 'online', 'offline'),
  price: String,
  source: String (enum: 'user_created', 'serpapi', 'serper'),
  userId: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### **Conversation Model**
```javascript
{
  userId: ObjectId (ref: User),
  sessionId: String (required),
  messages: Array,
  context: Object,
  createdAt: Date,
  updatedAt: Date
}
```

### **Registration Model**
```javascript
{
  userId: ObjectId (ref: User),
  eventId: ObjectId (ref: Event),
  registeredAt: Date,
  status: String
}
```

### **Reminder Model**
```javascript
{
  userId: ObjectId (ref: User),
  eventId: ObjectId (ref: Event),
  reminderDate: Date,
  sent: Boolean,
  createdAt: Date
}
```

---

## 🔐 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcryptjs with salt rounds
- **CORS Configuration**: Restricted to localhost/development
- **Input Validation**: express-validator for request validation
- **Environment Variables**: Sensitive data stored in .env
- **Header Size Limits**: Prevents 431 errors with large payloads

---

## 🚀 Deployment

### **Build Frontend**

```bash
cd frontend
npm run build
```

Build output will be in `frontend/build/`

### **Production Environment Variables**

Ensure all production API keys are set in your hosting environment.

### **Recommended Hosting**

- **Backend**: Heroku, Railway, Render, AWS
- **Frontend**: Vercel, Netlify, AWS S3 + CloudFront
- **Database**: MongoDB Atlas (Cloud)

---

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend and frontend |
| `npm run server` | Start backend only |
| `npm run client` | Start frontend only |
| `npm start` | Start production server |
| `npm run build` | Build frontend for production |
| `npm run view-db` | View database contents (utility) |

---

## 🐛 Troubleshooting

### **Port Already in Use**
- Backend automatically finds available port (3000-3009)
- Frontend uses port 3010+

### **Module Not Found Errors**
- Run `npm install` in both root and frontend directories
- Clear `node_modules/.cache` if issues persist

### **MongoDB Connection Issues**
- Verify `MONGO_URI` in `.env`
- Check MongoDB Atlas IP whitelist
- Ensure network connectivity

### **API Key Errors**
- Verify all API keys in `.env`
- Check API key quotas/limits
- Test API keys independently

---

## 📄 License

ISC License

---

## 👥 Author

Event Management Chatbot Team

---

## 🙏 Acknowledgments

- **OpenRouter**: AI response generation
- **SerpAPI & Serper**: Web search capabilities
- **Leaflet**: Interactive mapping
- **MongoDB**: Database storage
- **Express.js**: Backend framework
- **React**: Frontend framework

---

**Built with ❤️ using modern web technologies**
