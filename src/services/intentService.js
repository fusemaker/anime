export const detectIntent = (message) => {
  const lowerMessage = message.toLowerCase();

  // Registration intent - more variations
  if (lowerMessage.includes('register') || lowerMessage.includes('sign up') || 
      lowerMessage.includes('signup') || lowerMessage.includes('book') ||
      lowerMessage.includes('enroll') || lowerMessage.includes('rsvp') ||
      lowerMessage.includes('join event') || lowerMessage.includes('attend event')) {
    return 'registration';
  }

  // Reminder intent - more variations
  if (lowerMessage.includes('remind') || lowerMessage.includes('reminder') ||
      lowerMessage.includes('remaind') || lowerMessage.includes('notify') || 
      lowerMessage.includes('alert') || lowerMessage.includes('remind me') ||
      lowerMessage.includes('set reminder') || lowerMessage.includes('create reminder')) {
    return 'reminder';
  }

  // Create intent - more variations
  if (lowerMessage.includes('create') || lowerMessage.includes('add') ||
      lowerMessage.includes('new event') || lowerMessage.includes('plan event') ||
      lowerMessage.includes('organize event') || lowerMessage.includes('set up event') ||
      lowerMessage.includes('make event') || lowerMessage.includes('build event') ||
      lowerMessage.match(/(?:^|\s)(pongal|diwali|christmas|new year|holi|eid|festival|celebration)(?:\s|$)/i)) {
    return 'create';
  }

  // Discovery intent - more variations
  if (lowerMessage.includes('find') || lowerMessage.includes('search') ||
      lowerMessage.includes('discover') || lowerMessage.includes('show') ||
      lowerMessage.includes('list') || lowerMessage.includes('events') ||
      lowerMessage.includes('suggest') || lowerMessage.includes('recommend') ||
      lowerMessage.includes('what events') || lowerMessage.includes('which events') ||
      lowerMessage.includes('upcoming events') || lowerMessage.includes('nearby events')) {
    return 'discovery';
  }

  return 'general';
};

export const extractEventDetails = (message) => {
  const details = {
    location: null,
    category: null,
    date: null,
    useUserLocation: false,
  };
  
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('near me') || lowerMessage.includes('nearby') || 
      lowerMessage.includes('around me') || lowerMessage.includes('in my area') ||
      lowerMessage.includes('close to me') || lowerMessage.includes('local')) {
    details.useUserLocation = true;
  }

  const locationPatterns = [
    /(?:in|at|near|around)\s+([A-Z][a-zA-Z\s,]+?)(?:\s|$|,|\.)/,
    /location[:\s]+([A-Z][a-zA-Z\s,]+?)(?:\s|$|,|\.)/,
  ];

  const categoryPatterns = [
    /(?:category|type|kind)[:\s]+([a-zA-Z\s]+?)(?:\s|$|,|\.)/,
    /(conference|workshop|seminar|meeting|concert|festival|exhibition|webinar)/i,
  ];

  const datePatterns = [
    /(?:on|date|when)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /(\d{4}-\d{2}-\d{2})/,
    /tomorrow/i,
    /today/i,
    /next week/i,
    /this week/i,
    /this weekend/i,
  ];

  for (const pattern of locationPatterns) {
    const match = message.match(pattern);
    if (match) {
      details.location = match[1].trim();
      break;
    }
  }

  for (const pattern of categoryPatterns) {
    const match = message.match(pattern);
    if (match) {
      details.category = match[1].trim();
      break;
    }
  }

  for (const pattern of datePatterns) {
    const match = message.match(pattern);
    if (match) {
      const matchText = match[0].toLowerCase();
      if (matchText.includes('tomorrow')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        details.date = tomorrow.toISOString().split('T')[0];
      } else if (matchText.includes('today')) {
        details.date = new Date().toISOString().split('T')[0];
      } else if (matchText.includes('next week')) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        details.date = nextWeek.toISOString().split('T')[0];
      } else if (matchText.includes('this weekend')) {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysUntilSaturday = 6 - dayOfWeek;
        const weekend = new Date(today);
        weekend.setDate(today.getDate() + daysUntilSaturday);
        details.date = weekend.toISOString().split('T')[0];
      } else {
        // Try to parse the date
        const dateStr = match[1] ? match[1].trim() : match[0].trim();
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          details.date = parsedDate.toISOString().split('T')[0];
        } else {
          details.date = dateStr;
        }
      }
      break;
    }
  }

  return details;
};
