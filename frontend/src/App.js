import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPopup from './components/LoginPopup';
import SignupPopup from './components/SignupPopup';
import ChatBot from './components/ChatBot';
import InteractiveMap from './components/InteractiveMap';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(true);
  const [showSignup, setShowSignup] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
      setShowLogin(false);
    }
  }, []);

  const handleLoginSuccess = (tokenData, userData) => {
    setToken(tokenData);
    setUser(userData);
    setIsAuthenticated(true);
    setShowLogin(false);
    setShowSignup(false);
    localStorage.setItem('token', tokenData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setShowLogin(true);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const switchToSignup = () => {
    setShowLogin(false);
    setShowSignup(true);
  };

  const switchToLogin = () => {
    setShowSignup(false);
    setShowLogin(true);
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={
            !isAuthenticated ? (
              <>
                {showLogin && (
                  <LoginPopup
                    onLoginSuccess={handleLoginSuccess}
                    onSwitchToSignup={switchToSignup}
                  />
                )}
                {showSignup && (
                  <SignupPopup
                    onSignupSuccess={handleLoginSuccess}
                    onSwitchToLogin={switchToLogin}
                  />
                )}
              </>
            ) : (
              <ChatBot token={token} user={user} onLogout={handleLogout} />
            )
          } />
          <Route path="/events-map" element={
            isAuthenticated ? <InteractiveMap user={user} /> : <Navigate to="/" />
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
