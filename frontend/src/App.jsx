/* eslint-disable no-unused-vars */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import LandingPage from './components/LandingPage';
import SignInPage from './components/SignInPage';
import ChatInterface from './components/ChatInterface';
import StarredMessages from './components/StarredMessages';
import SettingsPage from './components/SettingsPage';
import ProtectedRoute from './components/ProtectedRoute';
import PreChat from './components/PreChat';
/* eslint-enable no-unused-vars */

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function App() {
  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route
            path="/prechat"
            element={
              <ProtectedRoute>
                <PreChat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <ChatInterface />
              </ProtectedRoute>
            }
          />
          <Route
            path="/starred"
            element={
              <ProtectedRoute>
                <StarredMessages />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  );
}

export default App;
