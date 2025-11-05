# DriveChat Frontend

Modern, dark-themed React frontend for DriveChat with Clerk authentication and real-time messaging.

## Features

- 🎨 **Dark Theme UI** - Beautiful dark mode interface
- 🔐 **Clerk Authentication** - Secure sign-in with Clerk
- 💬 **Real-time Chat** - Instant messaging with auto-delete
- ⭐ **Starred Messages** - File manager-like UI for starred content
- 📁 **File Sharing** - Upload and share files with messages
- ⏰ **Auto-Delete** - Configure message expiry times
- 🎯 **File Type Filtering** - Filter starred content by type (images, documents, videos, etc.)

## Tech Stack

- **React 19** - UI framework
- **Vite** - Build tool
- **Tailwind CSS 4** - Styling
- **Clerk** - Authentication
- **Axios** - API requests
- **React Router** - Navigation
- **Lucide React** - Icons
- **Day.js** - Date formatting

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Update `.env` with your values:

   ```env
   VITE_API_URL=http://localhost:5000
   VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key_here
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

## Pages

### Landing Page (`/`)

- Hero section with tagline
- Feature showcase
- Prominent sign-in button
- Call-to-action sections

### Sign In (`/signin`)

- Clerk authentication
- Auto-redirect to chat after sign-in

### Chat Interface (`/chat`)

- Real-time messaging
- File upload support
- Star/unstar messages
- Configurable auto-delete time
- Responsive sidebar

### Starred Messages (`/starred`)

- File manager-like UI
- Filter by file type (all, images, documents, videos, audio, archives)
- Grouped by date
- Download and unstar actions

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── LandingPage.jsx       # Home page
│   │   ├── SignInPage.jsx        # Authentication
│   │   ├── ChatInterface.jsx     # Main chat
│   │   ├── StarredMessages.jsx   # Starred content viewer
│   │   └── ProtectedRoute.jsx    # Auth guard
│   ├── App.jsx                   # Router setup
│   ├── main.jsx                  # Entry point
│   └── index.css                 # Global styles
├── .env.example                  # Environment template
└── package.json
```

## Available Scripts

- `npm run dev` - Start dev server (port 5173)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## API Integration

The frontend connects to the backend API at `VITE_API_URL`. Ensure the backend is running on `http://localhost:5000`.

### API Endpoints Used

- `GET /api/messages` - Fetch messages
- `POST /api/messages` - Send message
- `GET /api/messages/starred` - Fetch starred messages
- `POST /api/messages/:id/star` - Star a message
- `DELETE /api/messages/:id/star` - Unstar a message

## Authentication Flow

1. User clicks "Sign In" on landing page
2. Redirected to Clerk sign-in page
3. After successful auth, auto-redirected to `/chat`
4. Protected routes check auth status
5. User can access chat and starred messages

## Styling

- **Primary Colors**: Blue (#3b82f6) to Purple (#9333ea) gradient
- **Background**: Gray-950 (#030712)
- **Cards**: Gray-900 (#111827)
- **Borders**: Gray-800 (#1f2937)
- **Text**: White/Gray-100 for primary, Gray-400 for secondary

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

MIT

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
