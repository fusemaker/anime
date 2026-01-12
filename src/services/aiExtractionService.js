import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

// Use OpenRouter AI to extract event details from user messages
export const extractEventDetailsWithAI = async (message, conversationHistory = [], context = {}) => {
  try {
    const messages = [];
    messages.push({
      role: 'system',
      content: `You are a strict Event Information Extraction Engine.

Your ONLY task is to analyze the user message and extract structured event data from REAL, EXPLICIT information.

Return ONLY a valid JSON object with this exact structure:
{
  "intent": "create|discovery|registration|reminder|general",
  "eventTitle": string or null,
  "date": "YYYY-MM-DD" or null,
  "time": "HH:MM" (24-hour) or null,
  "location": string or null,
  "category": string or null,
  "useUserLocation": boolean
}

────────────────────
MANDATORY RULES
────────────────────
- Understand ANY language, ANY format, ANY writing style
- Extract ONLY what the user explicitly states
- NEVER guess or infer missing data
- If information is unclear or absent, return null
- Output must always be valid JSON — no text, no markdown, no explanation

INTENT RULES (NO PREDEFINED KEYWORDS - USE AI UNDERSTANDING):
- "create": user wants to create or confirm an event
  → Understand ANY phrasing that indicates creating, scheduling, confirming, or finalizing an event
  → if context.creatingEvent exists, default to "create"
  → Use conversation context to understand confirmations (yes, ok, confirm, create, no edit, etc.)
- "discovery": user wants to find or browse events
  → Understand ANY phrasing that indicates searching, finding, browsing, listing, or discovering events
  → Understand time-based modifiers (today, tomorrow, weekend, this week, next week, etc.) as discovery intent
  → Understand location-based queries (in [city], near me, nearby, around here, etc.) as discovery intent
  → If context.lastSearchQuery exists, understand time/location modifiers as discovery intent
  → Use conversation history to understand follow-up queries (e.g., "weekend" after "events in bengaluru")
- "registration": user wants to register or sign up
  → Understand ANY phrasing that indicates registering, signing up, RSVPing, booking, enrolling, or joining
- "reminder": user wants to set or manage reminders
  → Understand ANY phrasing that indicates setting reminders, notifications, or alerts
- "general": event-related but no clear action determined from context

DATE RULES:
- Parse natural language (tomorrow, next week, 15th Feb, etc.)
- Convert to ISO format (YYYY-MM-DD)
- If ambiguous or missing, return null
- NEVER invent or estimate dates

TIME RULES:
- Parse any format (10 AM, 14:00, evening, etc.)
- Convert to 24-hour format (HH:MM)
- Natural language: morning = 10:00, afternoon = 14:00, evening = 18:00
- If unclear, return null
- NEVER invent times

LOCATION RULES:
- Extract only explicitly stated locations (cities, addresses, venues, landmarks)
- If user says "near me", set useUserLocation = true
- Do NOT fabricate or normalize locations
- If no location mentioned, return null

CATEGORY RULES:
- Extract only explicit categories if mentioned (festival, conference, workshop, etc.)
- If not mentioned, return null
- NEVER infer category from event name alone

useUserLocation:
- true ONLY if user explicitly says "near me", "nearby", "around here", "local events"
- false otherwise

CONTEXT RULES:
- If context.creatingEvent exists, intent defaults to "create"
- Confirmation words ("yes", "ok", "confirm", "create") finalize creation
- Use conversation history to resolve ambiguous references
- Extract ONLY real data - don't copy previous values if new input contradicts them

Current conversation context: ${JSON.stringify(context)}

Remember: Extract ONLY real, actual, explicitly stated information. Use null for anything uncertain. Return ONLY valid JSON.`
    });

    // Add conversation history
    const recentHistory = conversationHistory.slice(-5);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: `Extract event details from this message: "${message}"`
    });

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o-mini', // Better JSON extraction
        messages: messages,
        temperature: 0.1, // Lower temperature for more consistent extraction
        max_tokens: 300,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://event-chatbot.com',
          'X-Title': 'Event Management Chatbot',
        },
        timeout: 30000,
      }
    );

    const content = response.data.choices[0]?.message?.content || '{}';
    let extracted = {};

    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        extracted = JSON.parse(content);
      }
    } catch (e) {
      logger.error('Error parsing AI extraction response:', e);
      // Return default values
      return {
        intent: 'general',
        eventTitle: null,
        date: null,
        time: null,
        location: null,
        category: null,
        useUserLocation: false,
      };
    }

    // Validate and normalize
    return {
      intent: extracted.intent || 'general',
      eventTitle: extracted.eventTitle || null,
      date: extracted.date || null,
      time: extracted.time || null,
      location: extracted.location || null,
      category: extracted.category || null,
      useUserLocation: extracted.useUserLocation === true,
    };
  } catch (error) {
    logger.error('Error extracting event details with AI:', error.response?.data || error.message);
    // Fallback to general intent
    return {
      intent: 'general',
      eventTitle: null,
      date: null,
      time: null,
      location: null,
      category: null,
      useUserLocation: false,
    };
  }
};

// Use OpenRouter AI to parse time string to hours and minutes
export const parseTimeWithAI = async (timeString, conversationHistory = []) => {
  try {
    const messages = [];
    messages.push({
      role: 'system',
      content: `You are a strict time parsing assistant.

Parse the input and return ONLY valid JSON:
{
  "hours": number (0–23),
  "minutes": number (0–59)
}

RULES:
- Support 12h, 24h, and natural language formats
- morning = 10:00, afternoon = 14:00, evening = 18:00
- If unclear or missing, return null
- Output JSON only - no explanations, no markdown, no extra text`
    });

    messages.push({
      role: 'user',
      content: `Parse this time: "${timeString}"`
    });

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o-mini',
        messages: messages,
        temperature: 0.1,
        max_tokens: 50,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const content = response.data.choices[0]?.message?.content || '{}';
    let parsed = {};

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch (e) {
      logger.error('Error parsing time with AI:', e);
      return null; // No default - return null if parsing fails
    }

    if (parsed.hours !== undefined && parsed.minutes !== undefined) {
      const hours = parseInt(parsed.hours);
      const minutes = parseInt(parsed.minutes) || 0;
      if (!isNaN(hours) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return { hours, minutes };
      }
    }

    return null; // No default - return null if parsing fails
  } catch (error) {
    logger.error('Error parsing time with AI:', error);
    return null; // No default - return null if parsing fails
  }
};

// Use OpenRouter AI to parse date string to Date object
export const parseDateWithAI = async (dateString, conversationHistory = []) => {
  try {
    const messages = [];
    messages.push({
      role: 'system',
      content: `You are a strict date parsing assistant.

Parse the given input and return ONLY valid JSON:
{
  "date": "YYYY-MM-DD" or null,
  "time": "HH:MM" or null
}

RULES:
- Support natural language and numeric formats (tomorrow, today, "10/1/2026", "January 10 2026", "next week", etc.)
- If a date range is provided, use the FIRST date only
- If a time range is provided, use the START time only
- Never assume missing values
- If parsing fails, return null fields
- Output JSON only - no explanations, no markdown, no extra text`
    });

    messages.push({
      role: 'user',
      content: `Parse this date: "${dateString}"`
    });

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-4o-mini',
        messages: messages,
        temperature: 0.1,
        max_tokens: 100,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const content = response.data.choices[0]?.message?.content || '{}';
    let parsed = {};

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch (e) {
      logger.error('Error parsing date with AI:', e);
      return null;
    }

    if (parsed.date) {
      // Handle date ranges - take first date
      let dateStr = parsed.date;
      if (dateStr.includes(' to ')) {
        dateStr = dateStr.split(' to ')[0].trim();
      }

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        logger.warn(`Invalid date parsed: ${parsed.date}`);
        return null;
      }

      // Handle time ranges - take start time (e.g., "13:00-21:00" -> "13:00")
      if (parsed.time) {
        let timeStr = parsed.time.trim();
        if (timeStr.includes('-')) {
          timeStr = timeStr.split('-')[0].trim();
        }
        const timeParts = timeStr.split(':');
        if (timeParts.length >= 2) {
          const hours = parseInt(timeParts[0]);
          const minutes = parseInt(timeParts[1]) || 0;
          if (!isNaN(hours) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            date.setHours(hours, minutes, 0, 0);
          }
        }
      }
      // If no time provided, don't set default - keep date without time (midnight/00:00)

      return date;
    }

    return null;
  } catch (error) {
    logger.error('Error parsing date with AI:', error);
    return null;
  }
};
