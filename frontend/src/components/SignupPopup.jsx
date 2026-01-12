import React, { useState } from 'react';
import styled from 'styled-components';
import api from '../utils/axiosConfig';

const SignupPopup = ({ onSignupSuccess, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/api/auth/signup', {
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });

      if (response.data && response.data.success) {
        onSignupSuccess(response.data.token, response.data.user);
      } else {
        setError(response.data?.error || 'Signup failed');
      }
    } catch (err) {
      // Extract error message from response
      let errorMessage = 'Signup failed. Please try again.';
      
      if (err.response?.data) {
        // Backend returned an error response
        errorMessage = err.response.data.error || err.response.data.message || errorMessage;
      } else if (err.request) {
        // Network error - no response from server
        if (err.code === 'ERR_NETWORK' || err.message.includes('ERR_CONNECTION_RESET') || err.message.includes('Network Error')) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running.';
        } else if (err.message) {
          errorMessage = `Network error: ${err.message}`;
        }
      } else if (err.message) {
        // Request setup error
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      console.error('Signup error:', {
        message: errorMessage,
        status: err.response?.status,
        data: err.response?.data,
        code: err.code,
        request: err.request,
        error: err
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <StyledWrapper>
      <div className="glitch-form-wrapper">
        <form className="glitch-card" onSubmit={handleSubmit}>
          <div className="card-header">
            <div className="card-title">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={24}
                height={24}
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                <path d="M12 11.5a3 3 0 0 0 -3 2.824v1.176a3 3 0 0 0 6 0v-1.176a3 3 0 0 0 -3 -2.824z" />
              </svg>
              <span>CREATE_ACCOUNT</span>
            </div>
            <div className="card-dots">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="card-body">
            {error && <div className="error-message">{error}</div>}
            <div className="form-group">
              <input
                type="text"
                id="username"
                name="username"
                required
                placeholder=" "
                value={formData.username}
                onChange={handleChange}
                autoComplete="username"
              />
              <label htmlFor="username" className="form-label" data-text="USERNAME">
                USERNAME
              </label>
            </div>
            <div className="form-group">
              <input
                type="email"
                id="email"
                name="email"
                required
                placeholder=" "
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
              />
              <label htmlFor="email" className="form-label" data-text="EMAIL">
                EMAIL
              </label>
            </div>
            <div className="form-group">
              <input
                type="password"
                id="password"
                name="password"
                required
                placeholder=" "
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
              />
              <label htmlFor="password" className="form-label" data-text="PASSWORD">
                PASSWORD
              </label>
            </div>
            <div className="form-group">
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                required
                placeholder=" "
                value={formData.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
              />
              <label htmlFor="confirmPassword" className="form-label" data-text="CONFIRM_PASSWORD">
                CONFIRM_PASSWORD
              </label>
            </div>
            <button
              data-text="CREATE_ACCOUNT"
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              <span className="btn-text">
                {loading ? 'CREATING...' : 'CREATE_ACCOUNT'}
              </span>
            </button>
            <div className="switch-link">
              <span>Already have an account? </span>
              <button type="button" onClick={onSwitchToLogin} className="link-btn">
                Login
              </button>
            </div>
          </div>
        </form>
      </div>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .glitch-form-wrapper {
    --bg-color: #0d0d0d;
    --primary-color: #00f2ea;
    --secondary-color: #a855f7;
    --text-color: #e5e5e5;
    --font-family: 'Fira Code', Consolas, 'Courier New', Courier, monospace;
    --glitch-anim-duration: 0.5s;
  }

  .glitch-form-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: var(--font-family);
    background-color: #050505;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
  }

  .glitch-card {
    background-color: var(--bg-color);
    width: 100%;
    max-width: 380px;
    border: 1px solid rgba(0, 242, 234, 0.2);
    box-shadow: 0 0 20px rgba(0, 242, 234, 0.1), inset 0 0 10px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    margin: 1rem;
    max-height: 90vh;
    overflow-y: auto;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: rgba(0, 0, 0, 0.3);
    padding: 0.5em 1em;
    border-bottom: 1px solid rgba(0, 242, 234, 0.2);
  }

  .card-title {
    color: var(--primary-color);
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    display: flex;
    align-items: center;
    gap: 0.5em;
  }

  .card-title svg {
    width: 1.2em;
    height: 1.2em;
    stroke: var(--primary-color);
  }

  .card-dots span {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #333;
    margin-left: 5px;
  }

  .card-body {
    padding: 1.5rem;
  }

  .error-message {
    color: #ff4444;
    font-size: 0.85rem;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background-color: rgba(255, 68, 68, 0.1);
    border: 1px solid rgba(255, 68, 68, 0.3);
  }

  .form-group {
    position: relative;
    margin-bottom: 1.5rem;
  }

  .form-label {
    position: absolute;
    top: 0.75em;
    left: 0;
    font-size: 1rem;
    color: var(--primary-color);
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    pointer-events: none;
    transition: all 0.3s ease;
  }

  .form-group input {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 2px solid rgba(0, 242, 234, 0.3);
    padding: 0.75em 0;
    font-size: 1rem;
    color: var(--text-color);
    font-family: inherit;
    outline: none;
    transition: border-color 0.3s ease;
  }

  .form-group input:focus {
    border-color: var(--primary-color);
  }

  .form-group input:focus + .form-label,
  .form-group input:not(:placeholder-shown) + .form-label {
    top: -1.2em;
    font-size: 0.8rem;
    opacity: 1;
  }

  .form-group input:focus + .form-label::before,
  .form-group input:focus + .form-label::after {
    content: attr(data-text);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: var(--bg-color);
  }

  .form-group input:focus + .form-label::before {
    color: var(--secondary-color);
    animation: glitch-anim var(--glitch-anim-duration)
      cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  }

  .form-group input:focus + .form-label::after {
    color: var(--primary-color);
    animation: glitch-anim var(--glitch-anim-duration)
      cubic-bezier(0.25, 0.46, 0.45, 0.94) reverse both;
  }

  @keyframes glitch-anim {
    0% {
      transform: translate(0);
      clip-path: inset(0 0 0 0);
    }
    20% {
      transform: translate(-5px, 3px);
      clip-path: inset(50% 0 20% 0);
    }
    40% {
      transform: translate(3px, -2px);
      clip-path: inset(20% 0 60% 0);
    }
    60% {
      transform: translate(-4px, 2px);
      clip-path: inset(80% 0 5% 0);
    }
    80% {
      transform: translate(4px, -3px);
      clip-path: inset(30% 0 45% 0);
    }
    100% {
      transform: translate(0);
      clip-path: inset(0 0 0 0);
    }
  }

  .submit-btn {
    width: 100%;
    padding: 0.8em;
    margin-top: 1rem;
    background-color: transparent;
    border: 2px solid var(--primary-color);
    color: var(--primary-color);
    font-family: inherit;
    font-size: 1rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    cursor: pointer;
    position: relative;
    transition: all 0.3s;
    overflow: hidden;
  }

  .submit-btn:hover:not(:disabled),
  .submit-btn:focus:not(:disabled) {
    background-color: var(--primary-color);
    color: var(--bg-color);
    box-shadow: 0 0 25px var(--primary-color);
    outline: none;
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submit-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .submit-btn .btn-text {
    position: relative;
    z-index: 1;
    transition: opacity 0.2s ease;
  }

  .submit-btn:hover:not(:disabled) .btn-text {
    opacity: 0;
  }

  .submit-btn::before,
  .submit-btn::after {
    content: attr(data-text);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    background-color: var(--primary-color);
    transition: opacity 0.2s ease;
  }

  .submit-btn:hover:not(:disabled)::before,
  .submit-btn:focus:not(:disabled)::before {
    opacity: 1;
    color: var(--secondary-color);
    animation: glitch-anim var(--glitch-anim-duration)
      cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  }

  .submit-btn:hover:not(:disabled)::after,
  .submit-btn:focus:not(:disabled)::after {
    opacity: 1;
    color: var(--bg-color);
    animation: glitch-anim var(--glitch-anim-duration)
      cubic-bezier(0.25, 0.46, 0.45, 0.94) reverse both;
  }

  .switch-link {
    margin-top: 1rem;
    text-align: center;
    font-size: 0.85rem;
    color: var(--text-color);
    opacity: 0.7;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--primary-color);
    cursor: pointer;
    text-decoration: underline;
    font-family: inherit;
    font-size: inherit;
    padding: 0;
    margin-left: 0.25rem;
  }

  .link-btn:hover {
    color: var(--secondary-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .form-group input:focus + .form-label::before,
    .form-group input:focus + .form-label::after,
    .submit-btn:hover::before,
    .submit-btn:focus::before,
    .submit-btn:hover::after,
    .submit-btn:focus::after {
      animation: none;
      opacity: 0;
    }

    .submit-btn:hover .btn-text {
      opacity: 1;
    }
  }
`;

export default SignupPopup;
