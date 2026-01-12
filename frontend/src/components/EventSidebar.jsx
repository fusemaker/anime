import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import api from '../utils/axiosConfig';

const EventSidebar = ({
  isOpen,
  onToggle,
  onEventSelect,
  onNewEvent,
  selectedEventId,
  user,
  mobileMenuOpen = false,
  onMobileMenuClose,
  location // User location for discovery
}) => {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('upcoming'); // Default to upcoming for "real" current data
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const sidebarRef = useRef(null);

  // Keep sidebar always expanded - disable collapse
  useEffect(() => {
    setIsCollapsed(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) {
        fetchEvents();
      }
    }, 300); // Debounce search

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, filter, searchQuery]);

  // Listen for refresh events from chatbot
  useEffect(() => {
    const handleRefresh = () => {
      fetchEvents();
    };

    window.addEventListener('refreshEvents', handleRefresh);
    return () => window.removeEventListener('refreshEvents', handleRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filter: filter === 'all' ? 'discovery' : filter, // Map 'all' (now Discover) to discovery backend filter
        limit: 50,
        search: searchQuery,
        location: location || '' // Pass user location
      });

      const response = await api.get(`/api/events?${params}`);
      if (response.data.success) {
        let fetchedEvents = response.data.events || [];

        // Client-side sort to ensure "real" timeline feel
        fetchedEvents.sort((a, b) => {
          const dateA = new Date(a.startDate);
          const dateB = new Date(b.startDate);

          if (filter === 'past') {
            return dateB - dateA; // Newest past first
          }
          // Default/Upcoming: Soonest first
          return dateA - dateB;
        });

        // If 'all', maybe push past events to bottom? 
        if (filter === 'all') {
          const now = new Date();
          const upcoming = fetchedEvents.filter(e => new Date(e.startDate) >= now).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
          const past = fetchedEvents.filter(e => new Date(e.startDate) < now).sort((a, b) => new Date(b.startDate) - new Date(a.startDate)); // Descending past
          fetchedEvents = [...upcoming, ...past];
        }

        setEvents(fetchedEvents);
      } else {
        // Handle case where success is false
        console.warn('API returned success: false', response.data);
        setEvents([]);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
      // Set empty array on error to prevent crashes
      setEvents([]);
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



  const handleEventClick = (event) => {
    if (onEventSelect) {
      onEventSelect(event);
    }
  };

  const handleDeleteEvent = async (eventId, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this event?')) {
      try {
        setLoading(true);
        const response = await api.delete(`/api/events/${eventId}`);
        if (response.data.success) {
          fetchEvents();
        } else {
          console.error('Delete failed:', response.data.error);
          alert(response.data.error || 'Failed to delete event');
        }
      } catch (error) {
        console.error('Error deleting event:', error);
        alert(error.response?.data?.error || 'Failed to delete event');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSidebarScroll = (e) => {
    // Stop scroll event from propagating to parent
    e.stopPropagation();
  };

  return (
    <StyledSidebar
      ref={sidebarRef}
      $collapsed={isCollapsed}
      $darkMode={true}
      $mobileMenuOpen={mobileMenuOpen}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onWheel={handleSidebarScroll}
    >
      {isCollapsed ? (
        <CollapsedSidebar>
          <CollapsedIconButton onClick={onNewEvent} title="New Event">
            <Icon>✏️</Icon>
          </CollapsedIconButton>
          <CollapsedIconButton onClick={() => setFilter('upcoming')} title="Upcoming Events">
            <Icon>🔍</Icon>
          </CollapsedIconButton>
          {isHovered && (
            <ExpandButton onClick={() => setIsCollapsed(false)} title="Expand Sidebar">
              →
            </ExpandButton>
          )}
        </CollapsedSidebar>
      ) : (
        <SidebarContent>
          {/* Header */}
          {/* Header */}
          <SidebarHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <SectionTitle style={{ marginBottom: 0 }}>Event Assistant</SectionTitle>
              {/* Mobile Close Button */}
              {mobileMenuOpen && onMobileMenuClose && (
                <MobileCloseButton onClick={onMobileMenuClose}>
                  ✕
                </MobileCloseButton>
              )}
            </div>
          </SidebarHeader>

          <SearchSection>
            <SearchInput
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SearchSection>

          <FiltersSection>
            <FilterTabs>
              <FilterTab
                $active={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                Discover
              </FilterTab>
              <FilterTab
                $active={filter === 'upcoming'}
                onClick={() => setFilter('upcoming')}
              >
                Upcoming
              </FilterTab>
              <FilterTab
                $active={filter === 'past'}
                onClick={() => setFilter('past')}
              >
                Past
              </FilterTab>
              <FilterTab
                $active={filter === 'registered'}
                onClick={() => setFilter('registered')}
              >
                Registered
              </FilterTab>
              <FilterTab
                $active={filter === 'created'}
                onClick={() => setFilter('created')}
              >
                Saved
              </FilterTab>
              <FilterTab
                $active={filter === 'remind_later'}
                onClick={() => setFilter('remind_later')}
              >
                Remind Me Later
              </FilterTab>
            </FilterTabs>
          </FiltersSection>

          <EventsSection>
            <SectionTitle>
              {filter === 'all' ? 'Discover Events' :
                filter === 'upcoming' ? 'Upcoming' :
                  filter === 'past' ? 'Past' :
                    filter === 'registered' ? 'Registered' :
                      filter === 'created' ? 'Saved Events' :
                        filter === 'remind_later' ? 'Remind Me Later' : 'Events'}
              <span style={{ opacity: 0.5, marginLeft: '8px', fontSize: '0.9em' }}>{events.length}</span>
            </SectionTitle>
            <EventsList>
              {loading ? (
                <LoadingMessage>Loading events...</LoadingMessage>
              ) : events.length === 0 ? (
                <EmptyMessage>No events found.</EmptyMessage>
              ) : (
                events.map((event) => (
                  <EventItem
                    key={event._id}
                    $selected={selectedEventId === event._id}
                    onClick={() => handleEventClick(event)}
                  >


                    <EventContent>
                      <div className="title-row">
                        <EventTitle>{event.title}</EventTitle>
                        {event.isRegistered ? <StatusDot $type="registered" /> :
                          event._id.toString().startsWith('serp_') && <span style={{ fontSize: '0.6rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginLeft: '4px' }}>EXT</span>}
                      </div>
                      <EventLocation>
                        <span>📍</span> {event.location || 'TBD'}
                      </EventLocation>
                    </EventContent>

                    <EventActionsOverlay className="actions">
                      <ActionIconButton onClick={(e) => { e.stopPropagation(); handleEventClick(event); }} title="Chat">
                        💬
                      </ActionIconButton>
                      {!event._id.toString().startsWith('serp_') && (
                        <ActionIconButton onClick={(e) => handleDeleteEvent(event._id, e)} title="Delete" $danger>
                          🗑️
                        </ActionIconButton>
                      )}
                    </EventActionsOverlay>
                  </EventItem>
                ))
              )}
            </EventsList>
          </EventsSection>

          {/* Footer */}
          <SidebarFooter>
            <FooterButton onClick={onNewEvent}>
              <PlusIcon>+</PlusIcon>
              New Event
            </FooterButton>
          </SidebarFooter>
        </SidebarContent>
      )}
    </StyledSidebar>
  );
};

// Styled Components
const StyledSidebar = styled.div`
  width: ${props => props.$collapsed ? '60px' : '280px'};
  min-width: ${props => props.$collapsed ? '60px' : '280px'};
  max-width: ${props => props.$collapsed ? '60px' : '280px'};
  height: 100vh;
  background: rgba(10, 15, 28, 0.98);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  color: #e8eaed;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 1000;
  box-shadow: 4px 0 32px rgba(0, 0, 0, 0.5);

  @media (max-width: 1024px) {
    width: ${props => props.$collapsed ? '60px' : '280px'};
    min-width: ${props => props.$collapsed ? '60px' : '280px'};
    max-width: ${props => props.$collapsed ? '60px' : '280px'};
  }

  @media (max-width: 768px) {
    width: ${props => props.$collapsed ? '0' : '280px'};
    min-width: ${props => props.$collapsed ? '0' : '280px'};
    max-width: ${props => props.$collapsed ? '0' : '280px'};
    transform: ${props => props.$collapsed || !props.$mobileMenuOpen ? 'translateX(-100%)' : 'translateX(0)'};
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.8);
    background: #0a0a0f; 
  }
`;

const SidebarContent = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const SidebarHeader = styled.div`
  padding: 1.5rem 1.25rem 1.25rem 1.25rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #ffffff;
  display: flex;
  align-items: center;
  opacity: 0.95;
`;

const SearchSection = styled.div`
  padding: 0 1.25rem 1rem 1.25rem;
  flex-shrink: 0;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-size: 0.875rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;

  &:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(0, 242, 234, 0.4);
    box-shadow: 0 0 0 3px rgba(0, 242, 234, 0.1);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
`;

const FiltersSection = styled.div`
  padding: 0 1.25rem;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
`;

const FilterTabs = styled.div`
  display: flex;
  gap: 0.6rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  scrollbar-width: none; 
  &::-webkit-scrollbar { display: none; }
`;

const FilterTab = styled.button`
  padding: 0.5rem 0.875rem;
  background: ${props => props.$active ? 'rgba(0, 242, 234, 0.12)' : 'transparent'};
  color: ${props => props.$active ? '#00f2ea' : 'rgba(255, 255, 255, 0.6)'};
  border: 1px solid ${props => props.$active ? 'rgba(0, 242, 234, 0.3)' : 'rgba(255, 255, 255, 0.15)'};
  border-radius: 18px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: ${props => props.$active ? 'rgba(0, 242, 234, 0.18)' : 'rgba(255, 255, 255, 0.08)'};
    color: ${props => props.$active ? '#00f2ea' : '#fff'};
    border-color: ${props => props.$active ? 'rgba(0, 242, 234, 0.4)' : 'rgba(255, 255, 255, 0.2)'};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const EventsSection = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 0.5rem; 
  margin-top: 0.5rem;
`;

const EventsList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0 0.75rem 5rem 0.75rem; 

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }
`;

const EventActionsOverlay = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100px;
  background: linear-gradient(90deg, transparent, rgba(15, 15, 20, 0.98));
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 1.25rem;
  opacity: 0;
  transform: translateX(10px);
  transition: all 0.3s ease;
  gap: 0.75rem;
  border-radius: 0 12px 12px 0;
`;

const EventItem = styled.div`
  position: relative;
  margin-bottom: 0.625rem;
  padding: 0.875rem 1rem;
  background: ${props => props.$selected
    ? 'rgba(0, 242, 234, 0.1)'
    : 'rgba(255, 255, 255, 0.03)'};
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 0.875rem;
  border: 1px solid ${props => props.$selected
    ? 'rgba(0, 242, 234, 0.3)'
    : 'rgba(255, 255, 255, 0.08)'};
  box-shadow: ${props => props.$selected
    ? '0 2px 12px rgba(0, 242, 234, 0.12)'
    : '0 1px 3px rgba(0, 0, 0, 0.2)'};

  &:hover {
    background: ${props => props.$selected
      ? 'rgba(0, 242, 234, 0.15)'
      : 'rgba(255, 255, 255, 0.06)'};
    border-color: ${props => props.$selected
      ? 'rgba(0, 242, 234, 0.4)'
      : 'rgba(255, 255, 255, 0.15)'};
    box-shadow: ${props => props.$selected
      ? '0 4px 16px rgba(0, 242, 234, 0.18)'
      : '0 4px 12px rgba(0, 0, 0, 0.3)'};
    transform: translateY(-2px);

    ${EventActionsOverlay} {
      opacity: 1;
      transform: translateX(0);
    }
  }

  &:active {
    transform: translateY(0);
  }

  ${props => props.$selected && `
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 15%;
      bottom: 15%;
      width: 3px;
      background: linear-gradient(180deg, #00f2ea 0%, #1affee 100%);
      border-radius: 0 2px 2px 0;
      box-shadow: 0 0 10px rgba(0, 242, 234, 0.5);
    }
  `}
`;

const EventContent = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
`;

const EventTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 1.5rem;
  line-height: 1.5;
  letter-spacing: -0.01em;
`;

const EventLocation = styled.div`
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  gap: 0.375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 0.375rem;
  font-weight: 400;

  span {
    filter: brightness(1.1);
    font-size: 0.75rem;
  }
`;

const StatusDot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: ${props => props.$type === 'registered' ? '#00f2ea' : '#666'};
  box-shadow: 0 0 6px ${props => props.$type === 'registered' ? 'rgba(0, 242, 234, 0.6)' : 'none'};
`;

const ActionIconButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: ${props => props.$danger ? 'rgba(255, 68, 68, 0.1)' : 'rgba(0, 242, 234, 0.1)'};
  color: ${props => props.$danger ? '#ff4444' : '#00f2ea'};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;

  &:hover {
    transform: scale(1.1);
    background: ${props => props.$danger ? 'rgba(255, 68, 68, 0.2)' : 'rgba(0, 242, 234, 0.2)'};
  }
`;

const SidebarFooter = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  background: linear-gradient(to top, rgba(10, 10, 15, 1) 20%, transparent);
  pointer-events: none;
  display: flex;
  justify-content: center;
  z-index: 100;
`;

const FooterButton = styled.button`
  pointer-events: auto;
  width: 100%;
  padding: 0.875rem 1rem;
  background: #00f2ea;
  border: none;
  border-radius: 10px;
  color: #0a0f1c;
  font-weight: 600;
  font-size: 0.9375rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0, 242, 234, 0.2);

  &:hover {
    background: #1affee;
    box-shadow: 0 4px 16px rgba(0, 242, 234, 0.3);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const PlusIcon = styled.span`
  font-size: 1.1rem;
  line-height: 1;
`;

const MobileCloseButton = styled.button`
  background: transparent;
  border: none;
  color: #fff;
  opacity: 0.5;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  
  &:hover { opacity: 1; }

  @media (min-width: 769px) { display: none; }
`;

// Collapsed components preserved for functionality
const CollapsedSidebar = styled.div`
  display: flex; flex-direction: column; align-items: center; padding: 1rem 0; gap: 1rem;
`;

const CollapsedIconButton = styled.button`
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05); border-radius: 10px; border: none; color: #fff; cursor: pointer;
  &:hover { background: rgba(0, 242, 234, 0.1); color: #00f2ea; }
`;

const Icon = styled.span` font-size: 1.2rem; `;

const ExpandButton = styled.button`
  position: absolute; top: 1rem; right: -28px; width: 28px; height: 28px;
  background: #1a1a1a; border: 1px solid #333; border-left: none;
  border-radius: 0 6px 6px 0; color: #00f2ea; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
`;
const LoadingMessage = styled.div` text-align: center; padding: 2rem; color: rgba(255,255,255,0.5); font-size: 0.85rem; `;
const EmptyMessage = styled.div` text-align: center; padding: 2rem; color: rgba(255,255,255,0.5); font-size: 0.85rem; `;

export default EventSidebar;
