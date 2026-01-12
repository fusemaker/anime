import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../utils/axiosConfig';

const ConversationHistory = ({ isOpen, onClose, onSelectConversation, currentSessionId, onNewChat }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen]);

  // Listen for conversation updates
  useEffect(() => {
    const handleConversationUpdate = () => {
      if (isOpen) {
        fetchConversations();
      }
    };

    window.addEventListener('conversationUpdated', handleConversationUpdate);
    return () => {
      window.removeEventListener('conversationUpdated', handleConversationUpdate);
    };
  }, [isOpen]);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/chat/history');
      if (response.data?.success) {
        setConversations(response.data.conversations || []);
      } else {
        console.warn('API returned success: false', response.data);
        setConversations([]);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
      // Set empty array on error to prevent crashes
      setConversations([]);
      // Show user-friendly error message
      if (error.response?.status === 401) {
        console.error("Authentication required. Please log in again.");
      } else if (error.response?.status >= 500) {
        console.error("Server error. Please try again later.");
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        console.error("Network error. Please check your connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sessionId, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this conversation?')) {
      try {
        const response = await api.delete(`/api/chat/history/${sessionId}`);
        if (response.data?.success) {
          setConversations(conversations.filter(c => c.sessionId !== sessionId));
          if (sessionId === currentSessionId) {
            onNewChat();
          }
        } else {
          alert(response.data?.error || 'Failed to delete conversation');
        }
      } catch (error) {
        console.error('Error deleting conversation:', error);
        const errorMessage = error.response?.data?.error || 
                           (error.code === 'ERR_NETWORK' ? 'Network error. Please check your connection.' : 'Failed to delete conversation');
        alert(errorMessage);
      }
    }
  };

  const formatDate = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <HistoryOverlay onClick={onClose}>
      <HistoryPanel onClick={(e) => e.stopPropagation()}>
        <HistoryHeader>
          <h3>Conversation History</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <RefreshButton 
              onClick={fetchConversations}
              title="Refresh"
              disabled={loading}
            >
              🔄
            </RefreshButton>
            <CloseButton onClick={onClose}>✕</CloseButton>
          </div>
        </HistoryHeader>
        <NewChatButton onClick={onNewChat}>
          ➕ New Chat
        </NewChatButton>
        <HistoryList>
          {loading ? (
            <LoadingText>Loading conversations...</LoadingText>
          ) : conversations.length === 0 ? (
            <EmptyText>No conversations yet. Start a new chat!</EmptyText>
          ) : (
            conversations.map((conv) => (
              <HistoryItem
                key={conv.sessionId}
                $active={conv.sessionId === currentSessionId}
                onClick={() => {
                  onSelectConversation(conv.sessionId);
                  onClose();
                }}
              >
                <HistoryItemContent>
                  <HistoryPreview>{conv.preview}</HistoryPreview>
                  <HistoryMeta>
                    <span>{conv.messageCount} messages</span>
                    <span>{formatDate(conv.updatedAt)}</span>
                  </HistoryMeta>
                </HistoryItemContent>
                <DeleteButton
                  onClick={(e) => handleDelete(conv.sessionId, e)}
                  title="Delete conversation"
                >
                  🗑️
                </DeleteButton>
              </HistoryItem>
            ))
          )}
        </HistoryList>
      </HistoryPanel>
    </HistoryOverlay>
  );
};

const HistoryOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 1001;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 1rem;
  backdrop-filter: blur(2px);
`;

const HistoryPanel = styled.div`
  background-color: #0d0d0d;
  border: 1px solid rgba(0, 242, 234, 0.2);
  border-radius: 8px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 20px rgba(0, 242, 234, 0.1);
  overflow: hidden;
`;

const HistoryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid rgba(0, 242, 234, 0.2);
  
  h3 {
    margin: 0;
    color: #00f2ea;
    font-size: 1.1rem;
    font-weight: 600;
  }
`;

const RefreshButton = styled.button`
  background: transparent;
  border: none;
  color: #00f2ea;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
  
  &:hover:not(:disabled) {
    background-color: rgba(0, 242, 234, 0.1);
    transform: rotate(180deg);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: #e5e5e5;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
`;

const NewChatButton = styled.button`
  margin: 1rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #00f2ea 0%, #a855f7 100%);
  border: none;
  border-radius: 6px;
  color: #0d0d0d;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 242, 234, 0.3);
  }
  
  &:active {
    transform: translateY(0);
  }
`;

const HistoryList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
`;

const HistoryItem = styled.div`
  display: flex;
  align-items: center;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  background-color: ${props => props.$active ? 'rgba(0, 242, 234, 0.1)' : 'transparent'};
  border: 1px solid ${props => props.$active ? 'rgba(0, 242, 234, 0.3)' : 'rgba(0, 242, 234, 0.1)'};
  transition: all 0.2s;
  
  &:hover {
    background-color: rgba(0, 242, 234, 0.15);
    border-color: rgba(0, 242, 234, 0.4);
  }
`;

const HistoryItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const HistoryPreview = styled.div`
  color: #e5e5e5;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const HistoryMeta = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: rgba(229, 229, 229, 0.6);
`;

const DeleteButton = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 68, 68, 0.7);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  margin-left: 0.5rem;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
  
  &:hover {
    background-color: rgba(255, 68, 68, 0.1);
    color: #ff4444;
  }
`;

const LoadingText = styled.div`
  padding: 2rem;
  text-align: center;
  color: rgba(229, 229, 229, 0.6);
`;

const EmptyText = styled.div`
  padding: 2rem;
  text-align: center;
  color: rgba(229, 229, 229, 0.6);
`;

export default ConversationHistory;
