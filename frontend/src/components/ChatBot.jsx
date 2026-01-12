import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import api from '../utils/axiosConfig';
import EventSidebar from './EventSidebar';
import ConversationHistory from './ConversationHistory';

const ChatBot = ({ token, user, onLogout }) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationDetected, setLocationDetected] = useState(false);
  const [locationPermission, setLocationPermission] = useState('prompt'); // 'prompt', 'granted', 'denied', 'unavailable'
  const [userHasBeenAsked, setUserHasBeenAsked] = useState(false); // Track if this specific user has been asked
  const [availableEvents, setAvailableEvents] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const previousUserIdRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [dynamicSuggestions, setDynamicSuggestions] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const silenceTimer = useRef(null);
  const synth = window.speechSynthesis;

  const handleNewChat = async () => {
    // Save current conversation before creating new one
    if (sessionId && messages.length > 0) {
      try {
        // Explicitly save the conversation to backend
        await api.post('/api/chat/save', {
          sessionId,
          messages,
        });
        console.log('✅ Conversation saved before new chat');
      } catch (error) {
        console.error('Error saving conversation before new chat:', error);
        // Continue anyway - conversation might already be saved
      }
    }
    
    // Small delay to ensure previous conversation is saved
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    setMessages([]);
    setDynamicSuggestions([]); // Clear suggestions for new chat
    setInput(''); // Clear input
    if (user?.id) {
      localStorage.setItem(`sessionId_${user.id}`, newSessionId);
      if (sessionId) {
        localStorage.removeItem(`messages_${sessionId}`);
      }
    }
    // Trigger conversation history update after new chat is created
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('conversationUpdated'));
    }, 500);
  };

  const handleSelectConversation = async (selectedSessionId) => {
    try {
      const response = await api.get(`/api/chat/history/${selectedSessionId}`);
      if (response.data.success) {
        const conversation = response.data.conversation;
        setSessionId(selectedSessionId);
        setMessages(conversation.messages || []);
        setDynamicSuggestions([]); // Clear suggestions - will be updated on next message
        setInput(''); // Clear input
        if (user?.id) {
          localStorage.setItem(`sessionId_${user.id}`, selectedSessionId);
          localStorage.setItem(`messages_${selectedSessionId}`, JSON.stringify(conversation.messages || []));
        }
        // Trigger conversation history update to refresh active state
        window.dispatchEvent(new CustomEvent('conversationUpdated'));
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
      alert('Failed to load conversation');
    }
  };

  const getSuggestions = () => {
    // Prioritize dynamic suggestions from backend
    if (dynamicSuggestions.length > 0) {
      return dynamicSuggestions;
    }

    // Fallback to diverse hardcoded suggestions
    const allSuggestions = [
      // Event Discovery - Location based
      "Find events near me",
      "Show events in my city",
      "What events are happening nearby?",

      // Event Discovery - Category based
      "Show tech conferences this week",
      "Find music concerts nearby",
      "What workshops are happening?",
      "Find business networking events",
      "Show cultural festivals",
      "Find sports events",
      "What art exhibitions are available?",

      // Event Discovery - Time based
      "Show events this weekend",
      "Find events tomorrow",
      "What events are happening next week?",
      "Show upcoming events this month",

      // Event Discovery - Type based
      "Find online events",
      "Show virtual conferences",
      "Find in-person events",

      // Event Creation
      "Create a new event",
      "I want to create an event",

      // Registration
      "Register me for an event",
      "How do I register for events?",

      // Reminders
      "Set a reminder for tomorrow's events",
      "Remind me about upcoming events",
      "Create a reminder for next week",
    ];

    // If events are available, prioritize registration suggestions
    if (availableEvents.length > 0) {
      const registrationSuggestions = availableEvents.slice(0, 2).map((event, idx) =>
        `Register for event ${idx + 1}`
      );
      // Mix registration suggestions with diverse base suggestions
      const shuffledBase = [...allSuggestions].sort(() => Math.random() - 0.5);
      return [...registrationSuggestions, ...shuffledBase.slice(0, 4)];
    }

    // Return random 6 suggestions for diversity
    const shuffled = [...allSuggestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  };

  useEffect(() => {
    if (sessionId === null) {
      // Try to load session from localStorage
      const savedSessionId = localStorage.getItem(`sessionId_${user?.id}`);
      if (savedSessionId) {
        setSessionId(savedSessionId);
        // Load conversation history
        const savedMessages = localStorage.getItem(`messages_${savedSessionId}`);
        if (savedMessages) {
          try {
            setMessages(JSON.parse(savedMessages));
          } catch (err) {
            console.error('Error loading messages:', err);
          }
        }
      } else {
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(newSessionId);
        localStorage.setItem(`sessionId_${user?.id}`, newSessionId);
      }
    }
  }, [sessionId, user?.id]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      localStorage.setItem(`messages_${sessionId}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);

  // Reset location state when a new user logs in (user ID changes)
  // This ensures EVERY new login/signup shows the location banner
  useEffect(() => {
    if (user && user.id) {
      const currentUserId = String(user.id); // Ensure string comparison
      const previousUserId = previousUserIdRef.current ? String(previousUserIdRef.current) : null;

      // Check if this is a new user (different from previous) OR first mount with user
      if (previousUserId !== currentUserId) {
        console.log('🆕 New user login detected! Resetting location state.');
        console.log('  Previous user:', previousUserId || '(none)', '| New user:', currentUserId);

        // ALWAYS reset all location-related state for new user login
        // This ensures banner shows for every new user, even in same browser
        setUserLocation(null);
        setLocationDetected(false);
        setLocationPermission('prompt');
        setUserHasBeenAsked(false); // Always reset to false so banner shows

        // Clear any stored "asked" state for this user (fresh start for each login)
        const userLocationKey = `location_asked_${currentUserId}`;
        const wasStored = localStorage.getItem(userLocationKey);
        localStorage.removeItem(userLocationKey);

        console.log('✅ Location state reset - banner should show now');
        console.log('  State after reset: userLocation=null, locationDetected=false, userHasBeenAsked=false');
        console.log('  Removed localStorage key:', userLocationKey, wasStored ? '(was set)' : '(was not set)');

        // Update previous user ID
        previousUserIdRef.current = currentUserId;
      } else {
        console.log('🔁 Same user - no reset needed. User ID:', currentUserId);
      }
    } else {
      console.log('⚠️ No user or user.id found. User object:', user);
      // Reset ref if no user
      previousUserIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Trigger when user ID changes (new login/signup)

  // Initialize location state for new users and debug banner visibility
  useEffect(() => {
    // Check if geolocation is available
    if (!navigator.geolocation) {
      console.log('Geolocation API not supported by this browser');
      setLocationPermission('unavailable');
      setLocationDetected(true);
      return;
    }

    // For new users who haven't been asked, ensure banner will show
    if (!userHasBeenAsked && user?.id) {
      console.log('🔍 Location banner visibility check for user:', user.id);
      console.log('  userHasBeenAsked:', userHasBeenAsked);
      console.log('  userLocation:', userLocation);
      console.log('  locationDetected:', locationDetected);
      console.log('  locationPermission:', locationPermission);

      // Ensure state is set correctly for banner to show
      if (locationPermission !== 'prompt') {
        setLocationPermission('prompt');
      }
      if (locationDetected) {
        setLocationDetected(false);
      }

      // Check browser permission state for logging only - don't auto-request
      if (navigator.permissions && navigator.permissions.query) {
        try {
          navigator.permissions.query({ name: 'geolocation' }).then((result) => {
            console.log('  Browser permission state:', result.state, '- banner will be shown');
          }).catch((err) => {
            console.log('  Error checking permission state:', err);
          });
        } catch (err) {
          console.log('  Permissions API not available:', err);
        }
      }

      // Log banner visibility condition
      const shouldShow = user?.id && !userLocation && !userHasBeenAsked;
      console.log('  ✅ Banner should be visible:', shouldShow);
    } else {
      console.log('🔍 Location banner check - conditions not met:', {
        hasUser: !!user?.id,
        userId: user?.id,
        userHasBeenAsked,
        userLocation
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, userHasBeenAsked]); // Run when user changes or userHasBeenAsked changes

  // Note: Removed auto-request on first interaction
  // Location will only be requested when user explicitly clicks the "Enable Location" button
  // This ensures the banner is always visible for new users

  const requestLocation = () => {
    console.log('🌍 Requesting location permission...');

    // Mark that this user has been asked
    if (user?.id) {
      const userLocationKey = `location_asked_${user.id}`;
      localStorage.setItem(userLocationKey, 'true');
      setUserHasBeenAsked(true);
    }

    // Clear any previous state (but keep locationPermission as 'prompt' if not yet determined)
    setLocationDetected(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setLocationDetected(true);
        setLocationPermission('granted');
        console.log('✅ Location detected:', {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      (error) => {
        console.log('Location error:', error.code, error.message);

        switch (error.code) {
          case error.PERMISSION_DENIED:
            console.log('❌ Location permission denied by user');
            setLocationPermission('denied');
            setLocationDetected(true);
            // Still mark as asked, but user can retry later
            break;
          case error.POSITION_UNAVAILABLE:
            console.log('⚠️ Location information unavailable');
            setLocationPermission('unavailable');
            setLocationDetected(true);
            break;
          case error.TIMEOUT:
            console.log('⏱️ Location request timeout - will retry if needed');
            setLocationPermission('timeout');
            // Don't mark as detected on timeout, allow retry
            break;
          default:
            console.log('❓ Unknown location error:', error);
            setLocationDetected(true);
            break;
        }
      },
      {
        timeout: 15000, // Increased timeout to 15 seconds to allow user time to respond
        enableHighAccuracy: false, // Use faster, less accurate location first (triggers faster prompt)
        maximumAge: 300000 // Accept cached location up to 5 minutes old
      }
    );
  };

  const handleSuggestionClick = async (suggestion) => {
    // Check for map-related suggestions (handle variations with/without emoji)
    const suggestionLower = suggestion.toLowerCase().trim();
    const isMapSuggestion = 
      suggestionLower.includes("view results on map") || 
      suggestionLower.includes("view on map") ||
      suggestionLower.includes("view on interactive map") ||
      (suggestionLower.includes("map") && (suggestionLower.includes("view") || suggestionLower.includes("show") || suggestionLower.includes("results")));
    
    if (isMapSuggestion) {
      // Navigate to map page immediately without sending message
      console.log('🗺️ Navigating to map page from suggestion:', suggestion);
      navigate('/events-map?filter=discovery&location=ALL');
      return;
    }
    
    // Auto-send the suggestion immediately (don't populate input first)
    if (!loading && suggestion.trim()) {
      await sendMessage(suggestion);
      setInput(''); // Ensure input is clear
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle input focus on mobile - ensure input stays visible when keyboard opens
  useEffect(() => {
    const handleInputFocus = () => {
      if (window.innerWidth <= 768) {
        // Small delay to let keyboard appear
        setTimeout(() => {
          inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 300);
      }
    };

    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener('focus', handleInputFocus);
      return () => {
        inputElement.removeEventListener('focus', handleInputFocus);
      };
    }
  }, []);

  const formatMessage = (text) => {
    if (!text) return text;

    let formatted = text;

    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    const regex = /(<[^>]+>)|(https?:\/\/[^\s<]+)/g;
    formatted = formatted.replace(regex, (match, htmlTag, url) => {
      if (htmlTag) return match; // Preserve existing HTML tags
      if (url) {
        const cleanUrl = url.replace(/[.,;!?]+$/, '');
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color: #00f2ea; text-decoration: underline; word-break: break-all;">${cleanUrl}</a>`;
      }
      return match;
    });

    return formatted;
  };

  const handleSaveEvent = async (eventData) => {
    if (!eventData || !eventData._id) {
      // Try to extract event info from message
      const message = messages[messages.length - 1];
      if (message && message.content) {
        // Try to find event title in message
        const titleMatch = message.content.match(/Event \d+:\s*([^\n<]+)/);
        if (titleMatch) {
          // Search for event by title
          try {
            const response = await api.get('/api/events', {
              params: { search: titleMatch[1].trim(), limit: 1 }
            });
            if (response.data.events && response.data.events.length > 0) {
              eventData = response.data.events[0];
            }
          } catch (err) {
            console.error('Error finding event:', err);
          }
        }
      }
      
      if (!eventData || !eventData._id) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: '❌ Could not find event to save. Please try again.'
        }]);
        return;
      }
    }

    try {
      const response = await api.post(`/api/events/${eventData._id}/save`);
      if (response.data.success) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `✅ Event "${eventData.title || 'Event'}" saved successfully! You can find it in the "Saved" section.`
        }]);
        // Refresh sidebar to show saved event
        window.dispatchEvent(new CustomEvent('refreshEvents'));
      }
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `❌ Error saving event: ${error.response?.data?.error || 'Unknown error'}`
      }]);
    }
  };

  const handleRemindLater = async (eventData) => {
    if (!eventData || !eventData._id) {
      // Try to extract event info from message
      const message = messages[messages.length - 1];
      if (message && message.content) {
        // Try to find event title in message
        const titleMatch = message.content.match(/Event \d+:\s*([^\n<]+)/);
        if (titleMatch) {
          // Search for event by title
          try {
            const response = await api.get('/api/events', {
              params: { search: titleMatch[1].trim(), limit: 1 }
            });
            if (response.data.events && response.data.events.length > 0) {
              eventData = response.data.events[0];
            }
          } catch (err) {
            console.error('Error finding event:', err);
          }
        }
      }
      
      if (!eventData || !eventData._id) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: '❌ Could not find event to set reminder. Please try again.'
        }]);
        return;
      }
    }

    try {
      const response = await api.post(`/api/events/${eventData._id}/remind-later`);
      if (response.data.success) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `⏰ Reminder set for "${eventData.title || 'Event'}"! I'll remind you in 24 hours. You can find it in the "Remind Me Later" section.`
        }]);
        // Refresh sidebar to show reminder
        window.dispatchEvent(new CustomEvent('refreshEvents'));
      }
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `❌ Error setting reminder: ${error.response?.data?.error || 'Unknown error'}`
      }]);
    }
  };

  const speak = (text) => {
    if (!text) return;

    // prolonged silence/cancel previous
    synth.cancel();

    // Strip HTML tags for speaking
    const cleanText = text.replace(/<[^>]*>/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1;
    utterance.pitch = 1;

    synth.speak(utterance);
  };

  const sendMessage = async (text) => {
    if (!text || loading) return;

    // Check if token exists before making request
    const token = localStorage.getItem('token');
    if (!token) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '❌ Error: Authentication required. Please log in again.' },
      ]);
      return;
    }

    const messageText = text.trim();
    if (!messageText) return;

    // Check if message is about viewing map - navigate instead of sending
    const messageLower = messageText.toLowerCase();
    if (
      messageLower.includes("view results on map") || 
      messageLower.includes("view on map") ||
      messageLower.includes("show on map") ||
      (messageLower.includes("map") && (messageLower.includes("view") || messageLower.includes("show")))
    ) {
      // Navigate to map page immediately
      navigate('/events-map?filter=discovery&location=ALL');
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', content: messageText }]);
    setLoading(true);

    try {
      console.log('Sending chat request:', {
        sessionId,
        messageLength: messageText.length,
        hasLocation: !!userLocation,
        hasToken: !!token
      });

      const response = await api.post('/api/chat', {
        sessionId,
        message: messageText,
        lat: userLocation?.lat,
        lon: userLocation?.lon,
      });

      if (response.data && response.data.success) {
        const formattedReply = formatMessage(response.data.reply);
        
        // Extract event data from response if available
        const eventData = response.data.eventData || null;
        
        // Update session ID first if provided
        const currentSessionId = response.data.sessionId || sessionId;
        if (response.data.sessionId && response.data.sessionId !== sessionId) {
          setSessionId(response.data.sessionId);
          // Save session ID to localStorage
          if (user?.id) {
            localStorage.setItem(`sessionId_${user.id}`, response.data.sessionId);
          }
        }

        // Update messages state
        setMessages((prev) => {
          const updatedMessages = [...prev, { 
            role: 'assistant', 
            content: formattedReply,
            eventData: eventData
          }];
          
          // Save messages to localStorage for persistence
          if (user?.id && currentSessionId) {
            localStorage.setItem(`messages_${currentSessionId}`, JSON.stringify(updatedMessages));
          }
          
          return updatedMessages;
        });

        // Speak the response
        speak(formattedReply);

        // Trigger conversation history update after a short delay to ensure DB is updated
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('conversationUpdated'));
        }, 500);

        // Update dynamic suggestions from backend (AI-generated based on context)
        if (response.data.suggestions && response.data.suggestions.length > 0) {
          setDynamicSuggestions(response.data.suggestions);
        } else {
          // Clear suggestions if backend doesn't provide any
          setDynamicSuggestions([]);
        }

        // Don't auto-refresh sidebar - user must save events manually
        // Only update available events for suggestions
        const eventMatches = formattedReply.match(/Event \d+:/g);
        if (eventMatches && eventMatches.length > 0) {
          setAvailableEvents(Array.from({ length: Math.min(eventMatches.length, 5) }, (_, i) => ({ id: i + 1 })));
        } else {
          setAvailableEvents([]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: response.data?.error || 'An error occurred. Please try again.' },
        ]);
      }
    } catch (error) {
      // Error handling logic
      let errorMessage = 'An error occurred. Please try again.';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ Error: ${errorMessage}` },
      ]);
      speak(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    await sendMessage(text);
  };

  const handleEventSelect = (event) => {
    setSelectedEvent(event);
    setInput(`Tell me about "${event.title}"`);
  };

  const handleNewEvent = () => {
    setInput('Create a new event');
  };

  const startVoiceRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true; // Use continuous so it doesn't stop on pause
      recognition.interimResults = true; // Show results in real-time
      recognition.maxAlternatives = 1;

      // Stop any existing speech synthesis when user starts talking
      synth.cancel();

      recognition.onstart = () => {
        setIsListening(true);
        console.log('Voice recognition started - speak now');
      };

      recognition.onresult = (event) => {
        // Get the latest transcript
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        // Update input visually
        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          setInput(currentText);

          // Clear any existing silence timer
          if (silenceTimer.current) {
            clearTimeout(silenceTimer.current);
          }

          // Set a new timer to auto-send after 3 seconds of silence
          silenceTimer.current = setTimeout(() => {
            console.log('Silence detected - auto sending message');
            recognition.stop(); // This will trigger onend
            sendMessage(currentText);
            setInput(''); // Clear input after auto-sending
            setIsListening(false);
          }, 3000); // 3 seconds silence timeout
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        if (event.error !== 'no-speech') {
          setIsListening(false);
        }
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access.');
        }
      };

      recognition.onend = () => {
        // If we manually stopped (via silence timer), isListening might already be false
        // But if it naturally ended without silence timer involved, we update state
        if (silenceTimer.current) {
          clearTimeout(silenceTimer.current);
        }

        // Only set listening to false if it's not already
        setIsListening((prev) => {
          if (prev) return false;
          return prev;
        });

        console.log('Voice recognition ended');
      };

      recognition.start();
    } else {
      alert('Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
    }
  };

  return (
    <StyledChatBot>
      {mobileMenuOpen && (
        <MobileOverlay onClick={() => setMobileMenuOpen(false)} />
      )}
      <EventSidebar
        isOpen={sidebarOpen}
        onToggle={() => {
          setSidebarOpen(!sidebarOpen);
          setMobileMenuOpen(false);
        }}
        onEventSelect={(event) => {
          handleEventSelect(event);
          setMobileMenuOpen(false);
        }}
        onNewEvent={() => {
          handleNewEvent();
          setMobileMenuOpen(false);
        }}
        selectedEventId={selectedEvent?._id}
        user={user}
        location={userLocation}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuClose={() => setMobileMenuOpen(false)}
      />
      <ConversationHistory
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelectConversation={handleSelectConversation}
        currentSessionId={sessionId}
        onNewChat={handleNewChat}
      />
      <ChatContainer $sidebarOpen={sidebarOpen}>
        <div className="chat-header">
          <div className="header-content">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <h2>Event Management Assistant</h2>
            <div className="header-actions">
              <button
                className="history-btn"
                onClick={() => setHistoryOpen(true)}
                title="Conversation History"
              >
                📜 History
              </button>
              <button
                className="new-chat-btn-header"
                onClick={handleNewChat}
                title="New Chat"
              >
                ➕ New Chat
              </button>
              <div className="user-info">
                <span>{user?.username}</span>
                <button onClick={onLogout} className="logout-btn">
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="chat-messages">
          {/* Show banner for new users - always show on new login/signup until user clicks button */}
          {user?.id && !userLocation && !userHasBeenAsked && (
            <div className="location-banner">
              <div className="location-banner-content">
                <span>📍 Enable location access for nearby event recommendations</span>
                <button
                  type="button"
                  className="location-enable-btn"
                  onClick={() => {
                    console.log('User clicked location enable button for user:', user.id);
                    requestLocation();
                  }}
                >
                  Enable Location
                </button>
              </div>
            </div>
          )}
          {/* Show denied banner only after user has interacted and browser explicitly denied */}
          {locationPermission === 'denied' && !userLocation && userHasBeenAsked && (
            <div className="location-banner location-denied">
              <div className="location-banner-content">
                <span>⚠️ Location access denied. You can manually enter your location when searching for events.</span>
                <button
                  type="button"
                  className="location-enable-btn"
                  onClick={() => {
                    console.log('User clicked retry location button');
                    setLocationPermission('prompt');
                    setLocationDetected(false);
                    setUserHasBeenAsked(false);
                    if (user?.id) {
                      const userLocationKey = `location_asked_${user.id}`;
                      localStorage.removeItem(userLocationKey);
                    }
                    requestLocation();
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          {messages.length === 0 && (
            <div className="welcome-message">
              <p>Welcome to the Event Management Assistant.</p>
              <p>I assist with discovering events, managing registrations, and setting reminders.</p>
              <p>How may I help you today?</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              <div
                className={`message-content ${msg.role === 'assistant' && (msg.eventData || msg.content.match(/Event \d+:/)) ? 'has-event-actions' : ''}`}
              >
                <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                {msg.role === 'assistant' && (msg.eventData || msg.content.match(/Event \d+:/)) && (
                  <div className="event-actions">
                    <label className="event-action-checkbox">
                      <input
                        type="checkbox"
                        onChange={() => handleSaveEvent(msg.eventData)}
                      />
                      <span style={{ color: '#00f2ea' }}>Save</span>
                    </label>
                    <label className="event-action-checkbox">
                      <input
                        type="checkbox"
                        onChange={() => handleRemindLater(msg.eventData)}
                      />
                      <span style={{ color: '#a855f7' }}>
                        Remind<br/>me later
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="message assistant">
              <div className="message-content typing">Processing request…</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="suggestions-bar">
          <div className="suggestions-label">Quick suggestions:</div>
          <div className="suggestions-list">
            {getSuggestions().map((suggestion, idx) => (
              <button
                key={idx}
                type="button"
                className="suggestion-btn"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
        <form className="chat-input-form" onSubmit={handleSend}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!loading && input.trim()) {
                  handleSend(e);
                }
              }
            }}
            placeholder="Ask about events, registrations, or reminders…"
            disabled={loading}
            aria-label="Chat input"
          />
          <button
            type="button"
            className={`voice-btn ${isListening ? 'listening' : ''}`}
            onClick={startVoiceRecognition}
            disabled={loading}
            title="Voice Search"
            aria-label="Voice input"
          >
            {isListening ? '🔴' : '🎤'}
          </button>
          <button 
            type="submit" 
            disabled={loading || !input.trim()}
            aria-label="Send message"
          >
            Send
          </button>
        </form>
      </ChatContainer>
    </StyledChatBot>
  );
};

const MobileOverlay = styled.div`
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 999;
  backdrop-filter: blur(2px);

  @media (max-width: 768px) {
    display: block;
  }
`;

const ChatContainer = styled.div`
  margin-left: ${props => props.$sidebarOpen ? '280px' : '0'};
  height: 100vh;
  width: ${props => props.$sidebarOpen ? 'calc(100% - 280px)' : '100%'};
  display: flex;
  flex-direction: column;
  position: relative;
  background: linear-gradient(135deg, #0a0f1c 0%, #050505 50%, #0a0f1c 100%);
  overflow: hidden;
  overscroll-behavior-y: none;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 1024px) {
    margin-left: ${props => props.$sidebarOpen ? '280px' : '0'};
    width: ${props => props.$sidebarOpen ? 'calc(100% - 280px)' : '100%'};
  }

  @media (max-width: 768px) {
    margin-left: 0 !important;
    width: 100% !important;
    height: 100vh;
    height: 100dvh;
    position: relative;
    display: flex;
    flex-direction: column;
  }
`;


const StyledChatBot = styled.div`
  display: flex;
  flex-direction: row;
  height: 100vh;
  width: 100%;
  background-color: #050505;
  position: relative;
  overflow: hidden;
  overscroll-behavior-y: none;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;

  .chat-header {
    background: rgba(10, 15, 28, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(0, 242, 234, 0.15);
    padding: 1.25rem 1.5rem;
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
    box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    min-width: 0;
    gap: 1rem;
  }

  .mobile-menu-btn {
    display: none;
    background: transparent;
    border: 1px solid #00f2ea;
    color: #00f2ea;
    padding: 0.5rem;
    cursor: pointer;
    font-size: 1.2rem;
    border-radius: 4px;
    transition: all 0.3s;
    flex-shrink: 0;

    &:hover {
      background-color: rgba(0, 242, 234, 0.2);
    }
  }

  .header-content h2 {
    color: #ffffff;
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
    background: linear-gradient(135deg, #00f2ea 0%, #ffffff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .history-btn {
    background: rgba(0, 242, 234, 0.08);
    border: 1px solid rgba(0, 242, 234, 0.2);
    color: #00f2ea;
    padding: 0.625rem 1.25rem;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 8px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;

    &:hover {
      background-color: rgba(0, 242, 234, 0.15);
      border-color: rgba(0, 242, 234, 0.4);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 242, 234, 0.15);
    }

    &:active {
      transform: translateY(0);
    }
  }

  .new-chat-btn-header {
    background: #00f2ea;
    border: none;
    color: #0a0f1c;
    padding: 0.625rem 1.25rem;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    border-radius: 8px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 242, 234, 0.2);

    &:hover {
      background: #1affee;
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(0, 242, 234, 0.3);
    }

    &:active {
      transform: translateY(0);
    }
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    color: #e5e5e5;
    font-size: 0.9rem;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .logout-btn {
    background: rgba(255, 75, 75, 0.08);
    border: 1px solid rgba(255, 75, 75, 0.3);
    color: #ff4b4b;
    padding: 0.625rem 1.25rem;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 8px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .logout-btn:hover {
    background-color: rgba(255, 75, 75, 0.15);
    border-color: rgba(255, 75, 75, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 75, 75, 0.15);
  }

  .logout-btn:active {
    transform: translateY(0);
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 0;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    scroll-behavior: smooth;
    align-items: stretch;
    
    &::-webkit-scrollbar {
      width: 8px;
    }
    
    &::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
    }
    
    &::-webkit-scrollbar-thumb {
      background: rgba(0, 242, 234, 0.3);
      border-radius: 4px;
    }
    
    &::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 242, 234, 0.5);
    }
  }

  .location-banner {
    background: linear-gradient(135deg, rgba(0, 242, 234, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
    border: 1px solid rgba(0, 242, 234, 0.3);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    animation: slideIn 0.3s ease-out;
  }

  .location-banner.location-denied {
    background: linear-gradient(135deg, rgba(255, 68, 68, 0.1) 0%, rgba(255, 152, 0, 0.1) 100%);
    border-color: rgba(255, 68, 68, 0.3);
  }

  .location-banner-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .location-banner-content span {
    color: #e5e5e5;
    font-size: 0.9rem;
    flex: 1;
    min-width: 200px;
  }

  .location-enable-btn {
    background: transparent;
    border: 2px solid #00f2ea;
    color: #00f2ea;
    padding: 0.5rem 1.5rem;
    cursor: pointer;
    font-family: 'Fira Code', Consolas, 'Courier New', Courier, monospace;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
    border-radius: 4px;
    transition: all 0.3s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .location-enable-btn:hover {
    background-color: #00f2ea;
    color: #0d0d0d;
    box-shadow: 0 0 15px rgba(0, 242, 234, 0.5);
  }

  .location-banner.location-denied .location-enable-btn {
    border-color: rgba(255, 68, 68, 0.5);
    color: rgba(255, 68, 68, 1);
  }

  .location-banner.location-denied .location-enable-btn:hover {
    background-color: rgba(255, 68, 68, 0.2);
    color: #ff4444;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .welcome-message {
    text-align: center;
    color: #e5e5e5;
    opacity: 0.8;
    line-height: 1.8;
    margin: 2rem 0;
  }

  .welcome-message p {
    margin: 0.5rem 0;
  }

  .message {
    display: flex;
    margin-bottom: 1rem;
    align-items: flex-start;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message.assistant {
    justify-content: flex-start;
  }

  .message-content {
    max-width: 70%;
    padding: 1rem 1.25rem;
    border-radius: 16px;
    word-wrap: break-word;
    line-height: 1.6;
    white-space: pre-line;
    position: relative;
    box-sizing: border-box;
    font-size: 0.9375rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .message-content a {
    color: #00f2ea;
    text-decoration: none;
    word-break: break-all;
    border-bottom: 1px solid rgba(0, 242, 234, 0.3);
    transition: all 0.2s ease;
  }

  .message-content a:hover {
    color: #1affee;
    border-bottom-color: #00f2ea;
  }

  .message-content strong {
    color: #00f2ea;
    font-weight: 600;
  }

  .message-content em {
    color: #8dd3f0;
    font-style: italic;
  }

  .message.user .message-content {
    background: linear-gradient(135deg, rgba(0, 242, 234, 0.15) 0%, rgba(0, 242, 234, 0.08) 100%);
    border: 1px solid rgba(0, 242, 234, 0.25);
    color: #ffffff;
    margin-left: auto;
  }

  .message.assistant .message-content {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e8eaed;
    margin-right: auto;
  }

  .message-content.has-event-actions {
    padding-right: 5rem;
    min-height: 3.5rem;
    overflow: visible;
    position: relative;
  }

  @media (max-width: 768px) {
    .message-content.has-event-actions {
      padding-right: 4.5rem;
      min-height: 3rem;
    }

    .event-actions {
      top: 0.5rem;
      right: 0.5rem;
      gap: 10px;
    }

    .event-action-checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin-bottom: 6px;
    }

    .event-action-checkbox span {
      font-size: 0.65rem;
    }
  }

  .message-content.typing {
    font-style: italic;
    opacity: 0.7;
  }

  .event-actions {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    z-index: 10;
    pointer-events: auto;
  }

  .event-action-checkbox {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    user-select: none;
    transition: transform 0.2s;
  }

  .event-action-checkbox:hover {
    transform: scale(1.05);
  }

  .event-action-checkbox input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    margin-bottom: 8px;
    border-radius: 4px;
    flex-shrink: 0;
    accent-color: #00f2ea;
  }

  .event-action-checkbox:last-child input[type="checkbox"] {
    accent-color: #a855f7;
  }

  .event-action-checkbox span {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.5px;
    line-height: 1.3;
    text-align: center;
    white-space: nowrap;
  }

  .chat-input-form {
    display: flex;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(10, 15, 28, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    gap: 0.75rem;
    flex-shrink: 0;
    z-index: 100;
    position: relative;
    align-items: center;
    box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.2);
  }

  .chat-input-form input {
    flex: 1;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #ffffff;
    padding: 0.875rem 1.125rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.9375rem;
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 12px;
    min-width: 0;
  }

  .chat-input-form input:focus {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(0, 242, 234, 0.4);
    box-shadow: 0 0 0 3px rgba(0, 242, 234, 0.1);
  }

  .chat-input-form input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .chat-input-form input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  .chat-input-form button[type="submit"] {
    background: #00f2ea;
    border: none;
    color: #0a0f1c;
    padding: 0.875rem 1.75rem;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.9375rem;
    font-weight: 600;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 12px;
    flex-shrink: 0;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 242, 234, 0.2);
  }

  .voice-btn {
    background: transparent;
    border: 1px solid rgba(0, 242, 234, 0.4);
    color: #e5e5e5;
    padding: 0.75rem;
    cursor: pointer;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .voice-btn:hover {
    background-color: rgba(0, 242, 234, 0.1);
    color: #00f2ea;
  }

  .voice-btn.listening {
    color: #ff4444;
    border-color: #ff4444;
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(255, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0); }
  }

  .chat-input-form button[type="submit"]:hover:not(:disabled) {
    background-color: #1affee;
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 242, 234, 0.3);
  }

  .chat-input-form button[type="submit"]:active:not(:disabled) {
    transform: translateY(0);
  }

  .chat-input-form button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .chat-messages::-webkit-scrollbar {
    width: 8px;
  }

  .chat-messages::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.3);
  }

  .chat-messages::-webkit-scrollbar-thumb {
    background: rgba(0, 242, 234, 0.3);
    border-radius: 4px;
  }

  .chat-messages::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 242, 234, 0.5);
  }

  .location-status {
    color: #00f2ea;
    font-size: 0.9rem;
    margin-top: 1rem;
    opacity: 0.8;
  }

  .suggestions-bar {
    padding: 1.25rem 1.5rem;
    background: rgba(10, 15, 28, 0.8);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
  }

  .suggestions-label {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.8125rem;
    margin-bottom: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .suggestions-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.625rem;
    align-items: flex-start;
  }

  .suggestion-btn {
    background: rgba(0, 242, 234, 0.08);
    border: 1px solid rgba(0, 242, 234, 0.2);
    color: #00f2ea;
    padding: 0.625rem 1.125rem;
    border-radius: 20px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
  }

  .suggestion-btn:hover {
    background-color: rgba(0, 242, 234, 0.15);
    border-color: rgba(0, 242, 234, 0.4);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 242, 234, 0.15);
  }

  .suggestion-btn:active {
    transform: translateY(0);
  }

  /* Tablet (768px - 1024px) */
  @media (max-width: 1024px) {
    .chat-header {
      padding: 0.75rem;
    }

    .header-content h2 {
      font-size: 1rem;
    }

    .header-actions {
      gap: 0.5rem;
    }

    .history-btn,
    .new-chat-btn-header {
      padding: 0.4rem 0.75rem;
      font-size: 0.75rem;
    }

    .user-info {
      font-size: 0.8rem;
      gap: 0.75rem;
    }

    .logout-btn {
      padding: 0.4rem 0.75rem;
      font-size: 0.75rem;
    }

    .chat-messages {
      padding: 1rem;
      gap: 0.75rem;
    }

    .message-content {
      max-width: 75%;
      padding: 0.6rem 0.85rem;
      font-size: 0.9rem;
    }

    .chat-input-form {
      padding: 0.75rem;
      gap: 0.4rem;
      align-items: center;
    }

    .chat-input-form input {
      padding: 0.6rem;
      font-size: 0.85rem;
      border-radius: 4px;
    }

    .voice-btn {
      min-width: 44px;
      min-height: 44px;
    }

    .chat-input-form button[type="submit"] {
      padding: 0.6rem 1.25rem;
      font-size: 0.85rem;
      border-radius: 4px;
    }

    .suggestions-bar {
      padding: 0.75rem;
    }

    .suggestion-btn {
      padding: 0.4rem 0.75rem;
      font-size: 0.75rem;
    }
  }

  /* Mobile (320px - 768px) */
  @media (max-width: 768px) {
    .chat-header {
      padding: 0.75rem 0.5rem;
      position: sticky;
      top: 0;
      z-index: 100;
      background-color: #050505;
      backdrop-filter: blur(10px);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    }

    .mobile-menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      padding: 0.5rem;
      font-size: 1.5rem;
      touch-action: manipulation;
    }

    .header-content {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      flex-wrap: wrap;
    }

    .header-content h2 {
      font-size: 0.9rem;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      order: 1;
    }

    .header-actions {
      order: 2;
      width: 100%;
      justify-content: flex-end;
      margin-top: 0.5rem;
      gap: 0.4rem;
    }

    .history-btn,
    .new-chat-btn-header {
      padding: 0.4rem 0.75rem;
      font-size: 0.7rem;
      flex: 1;
      min-width: 0;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      flex-shrink: 0;
      order: 3;
      width: 100%;
      justify-content: flex-end;
    }

    .user-info span {
      display: none;
    }

    .logout-btn {
      padding: 0.5rem 0.85rem;
      font-size: 0.75rem;
      min-width: 70px;
      min-height: 38px;
      touch-action: manipulation;
    }

    .chat-messages {
      padding: 1rem 0.75rem;
      padding-bottom: 2rem; 
      gap: 0.75rem;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .welcome-message {
      margin: 0.75rem 0;
      font-size: 0.8rem;
      padding: 0.75rem;
      line-height: 1.5;
    }

    .welcome-message p {
      margin: 0.4rem 0;
    }

    .message {
      margin-bottom: 0.6rem;
    }

    .message-content {
      max-width: 85%;
      padding: 0.6rem 0.85rem;
      font-size: 0.85rem;
      line-height: 1.5;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .message.user .message-content {
      max-width: 85%;
    }

    .chat-input-form {
      padding: 0.6rem;
      gap: 0.4rem;
      flex-wrap: nowrap;
      position: sticky;
      bottom: 0;
      background-color: #050505;
      border-top: 1px solid rgba(0, 242, 234, 0.2);
      z-index: 1000;
      width: 100%;
      box-sizing: border-box;
      align-items: center;
    }

    .chat-input-form input {
      padding: 0.6rem;
      font-size: 15px !important;
      min-width: 0;
      flex: 1;
      min-height: 44px;
      touch-action: manipulation;
      border-radius: 4px;
    }

    .voice-btn {
      min-width: 44px;
      min-height: 44px;
      flex-shrink: 0;
    }

    .chat-input-form button[type="submit"] {
      padding: 0.6rem 1rem;
      font-size: 0.8rem;
      flex: 0 0 auto;
      min-width: 60px;
      min-height: 44px;
      touch-action: manipulation;
      border-radius: 4px;
    }

    .suggestions-bar {
      padding: 0.6rem 0.4rem;
      background-color: rgba(0, 0, 0, 0.4);
    }

    .suggestions-label {
      font-size: 0.7rem;
      margin-bottom: 0.5rem;
    }

    .suggestion-btn {
      padding: 0.4rem 0.6rem;
      font-size: 0.7rem;
      white-space: normal;
      word-break: break-word;
      min-height: 44px;
      touch-action: manipulation;
      flex: 1 1 calc(50% - 0.25rem);
      max-width: calc(50% - 0.25rem);
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
  }

  /* Small Mobile (320px - 480px) */
  @media (max-width: 480px) {
    .chat-header {
      padding: 0.6rem 0.4rem;
    }

    .mobile-menu-btn {
      min-width: 40px;
      min-height: 40px;
      font-size: 1.3rem;
      padding: 0.4rem;
    }

    .header-content h2 {
      font-size: 0.8rem;
    }

    .user-info {
      font-size: 0.7rem;
      gap: 0.4rem;
    }

    .logout-btn {
      padding: 0.4rem 0.6rem;
      font-size: 0.65rem;
      min-width: 55px;
      min-height: 32px;
    }

    .chat-messages {
      padding: 0.75rem 0.5rem;
      gap: 0.6rem;
    }

    .welcome-message {
      padding: 0.85rem;
      font-size: 0.8rem;
      margin: 0.75rem 0;
    }

    .message-content {
      max-width: 88%;
      padding: 0.6rem 0.85rem;
      font-size: 0.8rem;
      line-height: 1.5;
    }

    .message.user .message-content {
      max-width: 85%;
    }

    .chat-input-form {
      padding: 0.6rem 0.4rem;
      gap: 0.4rem;
      align-items: center;
    }

    .chat-input-form input {
      font-size: 16px !important; /* Prevent iOS zoom on focus */
      padding: 0.65rem;
      min-height: 44px;
      border-radius: 4px;
    }

    .voice-btn {
      min-width: 44px;
      min-height: 44px;
    }

    .chat-input-form button[type="submit"] {
      font-size: 0.8rem;
      padding: 0.65rem 1rem;
      min-width: 65px;
      min-height: 44px;
      border-radius: 4px;
    }

    .suggestions-bar {
      padding: 0.6rem 0.4rem;
    }

    .suggestions-label {
      font-size: 0.7rem;
      margin-bottom: 0.5rem;
    }

    .suggestion-btn {
      font-size: 0.7rem;
      padding: 0.45rem 0.65rem;
      min-height: 44px;
      flex: 1 1 100%;
      max-width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
  }
`;

export default ChatBot;
