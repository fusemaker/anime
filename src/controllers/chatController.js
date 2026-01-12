import Conversation from '../models/Conversation.js';
import Event from '../models/Event.js';
import { generateResponse } from '../services/llmService.js';
import { extractEventDetailsWithAI, parseDateWithAI, parseTimeWithAI } from '../services/aiExtractionService.js';
import { searchEvents, searchEventDetails } from '../services/serperService.js';
import { createRegistration, getEventById, getUserRegistrations, createEvent } from '../services/eventService.js';
import { createReminder, getUserReminders } from '../services/reminderService.js';
import { getLocationDetails, reverseGeocode } from '../services/locationService.js';
import User from '../models/User.js';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import axios from 'axios';
import { config } from '../config/env.js';
import { safeSaveConversation } from '../utils/conversationPersistence.js';

// Helper function to generate contextual suggestions based on user's current action
const generateContextualSuggestions = (intent, context = {}) => {
  const suggestions = [];

  if (intent === 'discovery' && context.events && context.events.length > 0) {
    // Only suggest Map View if:
    // 1. User has location enabled
    // 2. The search was location-based (near me, in my city, nearby, etc.)
    // 3. Events have location data (lat/lng or location field)
    const hasUserLocation = context.userLocation && (context.userLocation.lat || context.userLocation.city);
    const isLocationBasedSearch = context.isLocationBased || false;
    const eventsHaveLocation = context.events.some(event => 
      (event.lat && event.lng) || (event.location && event.location.trim())
    );
    
    // Only show "View results on Map" for location-based searches when user has location
    if (hasUserLocation && isLocationBasedSearch && eventsHaveLocation) {
      suggestions.push("View results on Map 🗺️");
    }

    // After showing search results, suggest registration for top 2 events
    const topEvents = context.events.slice(0, 2);
    topEvents.forEach(event => {
      suggestions.push(`Register for ${event.title}`);
    });
    // Also suggest creating a reminder
    if (topEvents.length > 0) {
      suggestions.push(`Set reminder for ${topEvents[0].title}`);
    }
  } else if (intent === 'create' && context.eventCreated) {
    // After creating an event
    suggestions.push('View in sidebar');
    suggestions.push('Create another event');
    suggestions.push('Find similar events');
  } else if (intent === 'registration' && context.registered) {
    // After registration
    suggestions.push('Set a reminder');
    suggestions.push('View my registered events');
    suggestions.push('Find more events');
  } else if (intent === 'reminder' && context.reminderSet) {
    // After setting reminder
    suggestions.push('View my reminders');
    suggestions.push('Register for another event');
  } else {
    // Default suggestions for general queries
    suggestions.push('Show upcoming events');
    suggestions.push('Create a new event');
    suggestions.push('View my events');
  }

  return suggestions.slice(0, 3); // Max 3 suggestions to avoid clutter
};


export const chat = async (req, res) => {
  try {
    const { sessionId, message, lat, lon } = req.body;
    const userId = req.userId;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty' });
    }

    let conversation = await Conversation.findOne({ sessionId, userId });
    if (!conversation) {
      conversation = new Conversation({
        sessionId: sessionId || randomUUID(),
        userId,
        messages: [],
        context: {},
      });
    }

    conversation.messages.push({
      role: 'user',
      content: message.trim(),
      timestamp: new Date(),
    });

    // Use AI to extract all event details (intent, title, date, time, location, etc.)
    const conversationHistory = conversation.messages.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // CRITICAL: If we're waiting for confirmation on event creation, force intent to 'create' to enter the confirmation flow
    // This prevents "no" from being interpreted as a new request
    let extractedDetails;
    let intent;

    if (conversation.context?.creatingEvent?.waitingForConfirmation) {
      // We're in confirmation flow - treat any response as part of event creation flow
      logger.info(`[INTENT DETECTION] User is in confirmation flow for event "${conversation.context.creatingEvent.title}", forcing intent to 'create'`);
      intent = 'create';
      extractedDetails = { intent: 'create', eventTitle: null }; // Don't extract new event title
    } else {
      extractedDetails = await extractEventDetailsWithAI(message, conversationHistory, conversation.context);
      intent = extractedDetails.intent;

      // NO predefined patterns - let AI determine intent based on context
      // If intent is "general" but there's event-related context, let AI re-evaluate through context
      if (intent === 'general' && (conversation.context?.lastSearchQuery || conversation.context?.lastEventIds?.length > 0 || conversation.context?.creatingEvent)) {
        // Use AI to determine intent based on full conversation context - NO keyword matching
        // Let AI understand from conversation history what the user's intent is
        const contextPrompt = `Based on the FULL conversation context, determine the user's intent for this message: "${message}"

Previous context: ${conversation.context?.lastSearchQuery ? `User previously searched: "${conversation.context.lastSearchQuery}"` : 'No previous search'}
${conversation.context?.creatingEvent ? `User is currently creating event: "${conversation.context.creatingEvent.title}"` : ''}
Conversation history: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Determine if this is:
- "discovery" if user is continuing to search/find events (time modifiers like "weekend", "today" after asking about events)
- "create" if user is creating an event or responding to event creation prompts
- "registration" if user is registering
- "reminder" if user is setting reminders
- "general" if unclear

Return ONLY one word: "discovery", "create", "registration", "reminder", or "general"`;

        try {
          const contextResponse = await generateResponse(contextPrompt, { lastIntent: 'discovery', lastSearchQuery: conversation.context?.lastSearchQuery }, conversationHistory);
          const responseLower = contextResponse.toLowerCase().trim();
          if (responseLower.includes('discovery')) {
            intent = 'discovery';
            extractedDetails.intent = 'discovery';
          } else if (responseLower.includes('create')) {
            intent = 'create';
            extractedDetails.intent = 'create';
          }
        } catch (error) {
          // If AI check fails, trust the original intent extraction
          logger.warn('Error checking context intent:', error);
        }
      }
    }

    conversation.lastIntent = intent;

    let reply = '';

    let userLocation = null;
    const user = await User.findById(userId);

    if (user) {
      if (lat && lon) {
        const locationData = await reverseGeocode(lat, lon);
        if (locationData.success) {
          userLocation = locationData;
          user.lastLocation = {
            city: locationData.city,
            region: locationData.region,
            country: locationData.country,
            lat: locationData.lat,
            lon: locationData.lon,
            address: locationData.address,
          };
          await user.save();
          logger.info(`User location detected: ${locationData.city}, ${locationData.region}`);
        }
      } else if (user.lastLocation) {
        userLocation = user.lastLocation;
        logger.info(`Using saved location: ${userLocation.city}, ${userLocation.region}`);
      }
    }

    // Handle event creation - ALL AI-driven, no regex
    if (intent === 'create' || conversation.context?.creatingEvent) {
      // FIRST: Check if user is confirming event creation from previous message
      // Also check if we're in a confirmation flow (waitingForConfirmation might be true even if intent changed)
      const isWaitingForConfirmation = conversation.context?.creatingEvent?.waitingForConfirmation === true;

      logger.info(`[EVENT CREATION FLOW] intent="${intent}", hasCreatingEvent=${!!conversation.context?.creatingEvent}, waitingForConfirmation=${isWaitingForConfirmation}`);

      if (isWaitingForConfirmation) {
        // Use AI to understand user's natural response - NO predefined confirmation formats
        const confirmationPrompt = `The user is in the process of creating an event "${conversation.context.creatingEvent.title}". They have seen the event card with all details.

Previous conversation: User was asked if they want to edit the event details or proceed with creation.
User's current response: "${message}"
Full conversation context: ${JSON.stringify(conversationHistory.slice(-5).map(m => `${m.role}: ${m.content}`))}

CRITICAL: Understand the user's intent from their natural response:
- "proceed" = User wants to CREATE the event NOW (saying: yes, ok, create, go ahead, proceed, confirm, OR saying "no" to editing means they DON'T want to edit, so they want to proceed)
- "edit" = User wants to MODIFY/CHANGE the event details (saying: edit, change, modify, update, add, remove, different)
- "unclear" = User's response is ambiguous and needs clarification

IMPORTANT: If user says "no" to editing, that means they DON'T want to edit, so they want to PROCEED with creation. "No" to editing = "Yes" to creating.

Return ONLY one word: "proceed", "edit", or "unclear"
Use your natural language understanding - no keyword matching, understand intent from context.`;

        // FIRST: Check if user explicitly said "no" (which means proceed - they don't want to edit)
        const messageLower = message.toLowerCase().trim().replace(/[.,!?]/g, '').trim();
        let confirmationIntent = 'unclear';

        logger.info(`[CONFIRMATION] Processing confirmation for message: "${message}" (normalized: "${messageLower}")`);

        // Direct keyword detection to bypass AI for clear confirmations
        // 1. Positive confirmation (yes, proceed, ok, create)
        if (messageLower === 'yes' || messageLower.startsWith('yes ') ||
          messageLower.includes('proceed') ||
          messageLower === 'ok' || messageLower === 'okay' || messageLower === 'sure' ||
          messageLower === 'confirm' || messageLower.includes('go ahead') ||
          messageLower.includes('create it')) {
          confirmationIntent = 'proceed';
          logger.info(`[CONFIRMATION] ✅ User said "${message}" - DIRECTLY interpreted as "proceed" (Positive confirmation)`);
        }
        // 2. Negative confirmation to editing (no, nope = proceed with current)
        else if (messageLower === 'no' || messageLower === 'nope' || messageLower === 'nah' || messageLower === 'n' ||
          messageLower === 'no.' || messageLower === 'no!' || messageLower === 'no,' ||
          messageLower.startsWith('no ') || messageLower.startsWith('no.') || messageLower.startsWith('no,')) {
          confirmationIntent = 'proceed';
          logger.info(`[CONFIRMATION] ✅ User said "${message}" - DIRECTLY interpreted as "proceed" (No to editing)`);
        } else {
          // Use AI to understand other responses
          try {
            const confirmationResponse = await generateResponse(confirmationPrompt, { lastIntent: 'create' }, conversationHistory);
            // Let AI response determine intent - parse AI's response naturally
            const responseLower = confirmationResponse.toLowerCase().trim();
            // AI returns "proceed", "edit", or "unclear" - trust AI's understanding
            if (responseLower.includes('proceed')) {
              confirmationIntent = 'proceed';
            } else if (responseLower.includes('edit')) {
              confirmationIntent = 'edit';
            } else {
              // If AI returned unclear, ask AI to understand user's message directly with explicit "no" handling
              const directUnderstandingPrompt = `User said: "${message}"
Previous question: "Would you like to proceed with creating the event or do you want to edit any details?"
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`))}

CRITICAL: Understand if the user wants to:
- "proceed" = create the event as-is NOW (yes, ok, confirm, go ahead, proceed, create it, OR "no" which means they DON'T want to edit, so they want to proceed)
- "edit" = modify/change the event details (edit, change, modify, update, add, remove, different)

IMPORTANT RULE: If user says "no" (or "nope", "nah", etc.), that means they DON'T want to edit, so they want to PROCEED with creation. "No" to editing = "Yes" to creating = "proceed".

Examples:
- User says "no" → "proceed" (they don't want to edit, so create it)
- User says "yes" → "proceed" (they want to create it)
- User says "ok" → "proceed" (they want to create it)
- User says "edit the date" → "edit" (they want to modify)
- User says "change location" → "edit" (they want to modify)

Return ONLY one word: "proceed" or "edit"`;
              const directResponse = await generateResponse(directUnderstandingPrompt, {}, conversationHistory);
              const directLower = directResponse.toLowerCase().trim();
              // Trust AI's response - no hardcoded keyword matching
              if (directLower.includes('proceed')) {
                confirmationIntent = 'proceed';
              } else if (directLower.includes('edit')) {
                confirmationIntent = 'edit';
              }
            }
          } catch (error) {
            logger.warn('Error determining confirmation intent:', error);
            // If error, default based on message
            if (messageLower === 'no' || messageLower === 'nope' || messageLower === 'nah' || messageLower === 'n') {
              confirmationIntent = 'proceed';
            }
          }
        }

        logger.info(`[CONFIRMATION] Final confirmationIntent: "${confirmationIntent}" for user message: "${message}"`);

        // If confirming (proceed), create the event immediately
        if (confirmationIntent === 'proceed') {
          logger.info(`[CONFIRMATION] ✅ Proceeding with event creation for: "${conversation.context.creatingEvent.title}"`);
          // User confirmed - create event with stored information
          const savedTitle = conversation.context.creatingEvent.title;
          const savedFormattedDisplay = conversation.context.creatingEvent.formattedDisplay;
          const savedExtractedDate = conversation.context.creatingEvent.extractedDate;
          const savedExtractedTime = conversation.context.creatingEvent.extractedTime;
          const savedExtractedLocation = conversation.context.creatingEvent.extractedLocation;

          // Parse dates/times for event creation - ONLY use REAL dates from Serper or user input
          let finalEventDate = null;
          let hasRealDate = false;

          // Let AI extract dates - no hardcoded string manipulation
          const extractFirstDate = (dateString) => {
            if (!dateString) return null;
            // Return as-is, let AI parsing handle date ranges and formats
            return dateString.trim();
          };

          // Try to get date from saved extracted date (from Serper or user)
          if (savedExtractedDate) {
            const dateToParse = extractFirstDate(savedExtractedDate);
            finalEventDate = await parseDateWithAI(dateToParse, conversationHistory);
            if (finalEventDate && !isNaN(finalEventDate.getTime())) {
              hasRealDate = true;
            }
          }

          // If still no date, check Serper-extracted date from context
          if (!hasRealDate && conversation.context.creatingEvent?.serperExtractedDate) {
            const dateToParse = extractFirstDate(conversation.context.creatingEvent.serperExtractedDate);
            finalEventDate = await parseDateWithAI(dateToParse, conversationHistory);
            if (finalEventDate && !isNaN(finalEventDate.getTime())) {
              hasRealDate = true;
            }
          }

          // If NO real date found, create event anyway (user confirmed, we have snippets and links)
          // Date can be added later, or event can exist without a specific date
          if (!hasRealDate) {
            logger.info(`[EVENT CREATION] No date found for "${savedTitle}", but user confirmed creation. Creating event without date.`);
            // Continue to create event without date - user confirmed they want to proceed
          }

          // Set time ONLY if provided from real Serper data or user input
          if (savedExtractedTime) {
            const timeObj = await parseTimeWithAI(savedExtractedTime, conversationHistory);
            if (timeObj && timeObj.hours !== undefined) {
              finalEventDate.setHours(timeObj.hours, timeObj.minutes, 0, 0);
            }
            // If parsing fails, don't set default - keep date without time
          }
          // If no time provided, don't set default - use date only

          // Use location ONLY from real Serper data or user input - no defaults
          const finalLocation = savedExtractedLocation || (userLocation ? `${userLocation.city || ''}, ${userLocation.region || ''}`.trim() : null) || null;

          const eventData = {
            title: savedTitle,
            // NO default category - let AI extract from context
            startDate: finalEventDate || undefined, // Allow null/undefined if no date found
            location: finalLocation || undefined, // Allow null/undefined if no location found
            // NO default mode or price - let AI extract from web search or user input
            source: 'user_created',
            userId: userId, // Store userId so user can see their created events
          };

          logger.info(`[EVENT CREATION] Creating event with data:`, { title: eventData.title, hasDate: !!eventData.startDate, hasLocation: !!eventData.location });

          const createResult = await createEvent(eventData);

          if (createResult.success) {
            if (!conversation.context.lastEventIds) {
              conversation.context.lastEventIds = [];
            }
            conversation.context.lastEventIds.unshift(createResult.event._id);
            conversation.context.lastEventIds = conversation.context.lastEventIds.slice(0, 5);

            // Get saved snippets and links for event card display
            const savedTop5SnippetsSection = conversation.context.creatingEvent?.top5SnippetsSection || '';
            const savedTop5LinksSection = conversation.context.creatingEvent?.top5LinksSection || '';

            // Show the created event card (ONLY name, links, snippets) - dynamically generated by AI
            const eventCardPrompt = `The event "${savedTitle}" has been successfully created and saved to the database.

TOP 5 BEST SNIPPETS (if available):
${savedTop5SnippetsSection || ''}

TOP 5 BEST LINKS (if available):
${savedTop5LinksSection || ''}

Generate a natural, professional response that:
1. Confirms the event was created successfully with enthusiasm
2. Shows the created event card with ONLY these 3 things (NOTHING ELSE):
   - Event Name: "${savedTitle}"
   - Links (top 5 best - only if real links exist)
   - Snippets (top 5 best - only if real snippets exist)
3. ABSOLUTELY DO NOT show: date, time, location, mode, price, or ANY other fields
4. If snippets or links don't exist, DON'T show them - don't use placeholders
5. Explicitly tells the user: "You can view this event in the sidebar under 'Created Events' section" or similar clear instruction
6. Format the event card clearly and professionally

CRITICAL REQUIREMENTS:
- Show ONLY event name, links, and snippets. If any don't exist, don't show them.
- Do NOT show date, time, location, mode, price, or anything else.
- MUST mention that the event is now visible in the sidebar/Created Events section
- Be clear and direct about where to find the event

Generate ALL text dynamically - be natural, conversational, and helpful.`;

            reply = await generateResponse(eventCardPrompt, { lastIntent: 'create', eventTitle: savedTitle }, conversationHistory);

            // Remove any date/time/location fields that AI might have included
            reply = reply.replace(/\n\s*Date:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Location:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Time:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Day:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Month:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Mode:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Price:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Category:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Venue:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*Address:\s*[^\n]*/gi, '');
            reply = reply.replace(/\n\s*\d{1,2}\/\d{1,2}\/\d{4}[^\n]*/gi, '');
            reply = reply.replace(/\n\s*\d{4}-\d{2}-\d{2}[^\n]*/gi, '');
            reply = reply.replace(/\n\s*\d{1,2}:\d{2}[^\n]*/gi, '');

            delete conversation.context.creatingEvent;

            conversation.markModified('context');
            const saveResultLast = await safeSaveConversation(conversation);
            if (!saveResultLast.success) {
              logger.error('[CHAT] Failed to save conversation', { sessionId: conversation.sessionId, error: saveResultLast.error });
            }
            res.json({
              success: true,
              reply,
              sessionId: conversation.sessionId,
              refreshEvents: true,
            });
            return;
          } else {
            const errorPrompt = `Event creation failed for "${savedTitle}".
Error: ${createResult.error || 'Unknown error'}
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, professional error message that:
1. Acknowledges the failure
2. Explains what went wrong (use the error information provided)
3. Suggests what the user can do next
4. Is helpful and professional

Generate ALL text dynamically - no templates, be natural and helpful.`;
            reply = await generateResponse(errorPrompt, { lastIntent: 'create', eventTitle: savedTitle }, conversationHistory);
            conversation.markModified('context');
            const saveResult1 = await safeSaveConversation(conversation);
            if (!saveResult1.success) {
              logger.error('[CHAT] Failed to save conversation (event created)', { sessionId: conversation.sessionId, error: saveResult1.error });
            }
            res.json({
              success: true,
              reply,
              sessionId: conversation.sessionId,
            });
            return;
          }
        } else if (confirmationIntent === 'edit') {
          // User wants to edit - use AI to naturally understand what they want to edit
          const editPrompt = `The user wants to edit the event "${conversation.context.creatingEvent.title}". 
Their message: "${message}"
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, professional response that:
1. Acknowledges they want to edit
2. Asks what specific details they'd like to modify (naturally, not as a rigid list)
3. Be conversational and helpful

Generate ALL text dynamically - no templates, make it natural.`;
          reply = await generateResponse(editPrompt, { lastIntent: 'create', editingEvent: true }, conversationHistory);
          conversation.markModified('context');
          const saveResult3 = await safeSaveConversation(conversation);
          if (!saveResult3.success) {
            logger.error('[CHAT] Failed to save conversation (edit)', { sessionId: conversation.sessionId, error: saveResult3.error });
          }
          res.json({
            success: true,
            reply,
            sessionId: conversation.sessionId,
          });
          return;
        } else {
          // User response is unclear - BUT check one more time if it's "no" (might have been missed in normalization)
          const messageLowerFinal = message.toLowerCase().trim().replace(/[.,!?;:]/g, '').trim();
          if (messageLowerFinal === 'no' || messageLowerFinal === 'nope' || messageLowerFinal === 'nah' || messageLowerFinal === 'n' ||
            messageLowerFinal.startsWith('no ') || messageLowerFinal === 'not' || messageLowerFinal === 'nope.') {
            // It's "no" - treat as proceed by redirecting to proceed logic
            logger.info(`[CONFIRMATION] Final fallback: User said "${message}" (normalized: "${messageLowerFinal}") - treating as "proceed"`);
            // Re-run the proceed logic by setting confirmationIntent and jumping to proceed block
            // Actually, better to call the same proceed logic - but it's already defined above
            // Let's just set a flag and handle it here inline
            confirmationIntent = 'proceed';
            // We'll handle this in the proceed block, but we need to break out of this else
            // Actually, the simplest is to just treat "no" as proceed here directly
            // Let me just set the intent and let it fall through to be handled above... no that won't work
            // Best approach: duplicate the proceed logic here but simplified
            const savedTitle = conversation.context.creatingEvent.title;
            const savedTop5SnippetsSection = conversation.context.creatingEvent?.top5SnippetsSection || '';
            const savedTop5LinksSection = conversation.context.creatingEvent?.top5LinksSection || '';
            const savedExtractedDate = conversation.context.creatingEvent.extractedDate;
            const savedExtractedTime = conversation.context.creatingEvent.extractedTime;
            const savedExtractedLocation = conversation.context.creatingEvent.extractedLocation;

            let finalEventDate = null;
            let hasRealDate = false;

            if (savedExtractedDate) {
              const dateToParse = savedExtractedDate.trim();
              finalEventDate = await parseDateWithAI(dateToParse, conversationHistory);
              if (finalEventDate && !isNaN(finalEventDate.getTime())) {
                hasRealDate = true;
              }
            }

            if (!hasRealDate && conversation.context.creatingEvent?.serperExtractedDate) {
              const dateToParse = conversation.context.creatingEvent.serperExtractedDate.trim();
              finalEventDate = await parseDateWithAI(dateToParse, conversationHistory);
              if (finalEventDate && !isNaN(finalEventDate.getTime())) {
                hasRealDate = true;
              }
            }

            if (!hasRealDate) {
              logger.info(`[EVENT CREATION] No date found for "${savedTitle}", but user confirmed. Creating event without date.`);
            }

            if (savedExtractedTime && finalEventDate) {
              const timeObj = await parseTimeWithAI(savedExtractedTime, conversationHistory);
              if (timeObj && timeObj.hours !== undefined) {
                finalEventDate.setHours(timeObj.hours, timeObj.minutes, 0, 0);
              }
            }

            const finalLocation = savedExtractedLocation || (userLocation ? `${userLocation.city || ''}, ${userLocation.region || ''}`.trim() : null) || null;

            const eventData = {
              title: savedTitle,
              startDate: finalEventDate || undefined,
              location: finalLocation || undefined,
              source: 'user_created',
              userId: userId,
            };

            logger.info(`[EVENT CREATION] Creating event (from unclear/no fallback) with data:`, { title: eventData.title, hasDate: !!eventData.startDate });

            const createResult = await createEvent(eventData);

            if (createResult.success) {
              if (!conversation.context.lastEventIds) {
                conversation.context.lastEventIds = [];
              }
              conversation.context.lastEventIds.unshift(createResult.event._id);

              const eventCardPrompt = `The event "${savedTitle}" has been successfully created and saved to the database.

TOP 5 BEST SNIPPETS (if available):
${savedTop5SnippetsSection || ''}

TOP 5 BEST LINKS (if available):
${savedTop5LinksSection || ''}

Generate a natural, professional response that:
1. Confirms the event was created successfully with enthusiasm (say something like "Great! Your event has been created successfully!")
2. Shows the created event card with ONLY these 3 things (NOTHING ELSE):
   - Event Name: "${savedTitle}"
   - Links (top 5 best - only if real links exist)
   - Snippets (top 5 best - only if real snippets exist)
3. ABSOLUTELY DO NOT show: date, time, location, mode, price, or ANY other fields
4. If snippets or links don't exist, DON'T show them - don't use placeholders
5. MUST explicitly tell the user: "You can view this event in the sidebar under 'Created Events' section" or "Check the sidebar to see your created event" - be very clear about where to find it
6. Format the event card clearly and professionally

CRITICAL REQUIREMENTS:
- Show ONLY event name, links, and snippets. If any don't exist, don't show them.
- Do NOT show date, time, location, mode, price, or anything else.
- MUST mention that the event is now visible in the sidebar/Created Events section - this is very important
- Be enthusiastic and clear about where to find the event

Generate ALL text dynamically - be natural, conversational, and helpful.`;

              reply = await generateResponse(eventCardPrompt, { lastIntent: 'create', eventTitle: savedTitle }, conversationHistory);

              // Remove any date/time/location fields
              reply = reply.replace(/\n\s*Date:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Location:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Time:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Day:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Month:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Mode:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Price:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Category:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Venue:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*Address:\s*[^\n]*/gi, '');
              reply = reply.replace(/\n\s*\d{1,2}\/\d{1,2}\/\d{4}[^\n]*/gi, '');
              reply = reply.replace(/\n\s*\d{4}-\d{2}-\d{2}[^\n]*/gi, '');
              reply = reply.replace(/\n\s*\d{1,2}:\d{2}[^\n]*/gi, '');

              delete conversation.context.creatingEvent;

              conversation.markModified('context');
              const saveResultB = await safeSaveConversation(conversation);
              if (!saveResultB.success) {
                logger.error('[CHAT] Failed to save conversation (event creation)', { sessionId: conversation.sessionId, error: saveResultB.error });
              }
              res.json({
                success: true,
                reply,
                sessionId: conversation.sessionId,
                refreshEvents: true,
              });
              return;
            } else {
              // Error creating event
              const errorPrompt = `Event creation failed for "${savedTitle}". Error: ${createResult.error || 'Unknown error'}. Generate a helpful error message.`;
              reply = await generateResponse(errorPrompt, { lastIntent: 'create' }, conversationHistory);
              conversation.markModified('context');
              const saveResult5 = await safeSaveConversation(conversation);
              if (!saveResult5.success) {
                logger.error('[CHAT] Failed to save conversation (event creation failure)', { sessionId: conversation.sessionId, error: saveResult5.error });
              }
              res.json({ success: true, reply, sessionId: conversation.sessionId });
              return;
            }
          }

          // If still unclear and not "no", ask for clarification
          const clarifyPrompt = `The user is creating an event "${conversation.context.creatingEvent.title}". 
They were asked if they want to edit or proceed with creation.
Their response: "${message}"
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Their response is ambiguous. Generate a natural, brief clarification message asking if they want to:
- Proceed with creating the event as-is, or
- Edit/modify the event details

Generate ALL text dynamically - be natural and conversational, not templated.`;
          reply = await generateResponse(clarifyPrompt, { lastIntent: 'create' }, conversationHistory);
          conversation.markModified('context');
          const saveResult6 = await safeSaveConversation(conversation);
          if (!saveResult6.success) {
            logger.error('[CHAT] Failed to save conversation (clarify)', { sessionId: conversation.sessionId, error: saveResult6.error });
          }
          res.json({
            success: true,
            reply,
            sessionId: conversation.sessionId,
          });
          return;
        }
      }

      // If we just handled confirmation (proceed/edit/unclear), don't continue to main event creation flow
      // This prevents asking for title again after confirmation handling
      if (conversation.context?.creatingEvent?.waitingForConfirmation) {
        // This should not happen - if waitingForConfirmation is true, we should have handled it above
        // But if it somehow didn't get handled, clear the context to avoid infinite loops
        logger.warn('[EVENT CREATION] Still waiting for confirmation after handling - clearing context');
        delete conversation.context.creatingEvent;
      }

      let eventTitle = extractedDetails.eventTitle;
      let eventDate = null;
      let eventTime = null;
      let eventLocation = extractedDetails.location;

      // If continuing event creation, get title from context
      let eventDetailsFromSerper = null;
      if (conversation.context?.creatingEvent && !conversation.context.creatingEvent.waitingForConfirmation) {
        eventTitle = conversation.context.creatingEvent.title || eventTitle;
        // Use previously extracted Serper details if available
        if (conversation.context.creatingEvent.serperDetails) {
          eventDetailsFromSerper = conversation.context.creatingEvent.serperDetails;
        }
      }

      // If no event title, ask for it using AI
      if (!eventTitle) {
        const askEventPrompt = `The user intends to create an event but has not provided a name.
Generate a clear, professional question requesting the event title.`;
        reply = await generateResponse(askEventPrompt, { lastIntent: 'create' }, conversationHistory);
        const saveResult = await safeSaveConversation(conversation);
        if (!saveResult.success) {
          logger.error('[CHAT] Failed to save conversation (ask event)', { sessionId: conversation.sessionId, error: saveResult.error });
        }
        res.json({ success: true, reply, sessionId: conversation.sessionId });
        return;
      } else {
        // ALWAYS search web for event details using Serper API (if not already searched)
        // This calls REAL Serper API which searches Google and returns real web results
        let isFirstSearch = false;
        if (!eventDetailsFromSerper) {
          isFirstSearch = true;
          logger.info(`[REAL WEB SEARCH] Calling Serper API (Google search) for "${eventTitle}"...`);
          eventDetailsFromSerper = await searchEventDetails(eventTitle);
          logger.info(`[REAL WEB SEARCH] Serper API returned ${eventDetailsFromSerper.rawSnippets?.length || 0} real web results for "${eventTitle}"`);
        }

        // ALL Serper web scraped data will be passed to OpenRouter for extraction and display
        // No pre-processing needed - OpenRouter will handle everything

        // Initialize variables
        let eventDate = null;
        let eventTime = null;
        let eventLocation = extractedDetails.location || null;

        // Use AI to parse date if provided by user
        if (extractedDetails.date) {
          eventDate = await parseDateWithAI(extractedDetails.date, conversationHistory);
        }

        // Use AI to parse time if provided by user (time-only strings like "10.00 AM")
        if (extractedDetails.time) {
          const timeObj = await parseTimeWithAI(extractedDetails.time, conversationHistory);
          if (timeObj && timeObj.hours !== undefined) {
            eventTime = new Date();
            eventTime.setHours(timeObj.hours, timeObj.minutes, 0, 0);
          }
        }

        // Use location from user or auto-detect
        if (!eventLocation && (extractedDetails.useUserLocation || userLocation)) {
          eventLocation = userLocation ? `${userLocation.city || ''}, ${userLocation.region || ''}`.trim() : null;
        }

        // User-provided values for display
        const userProvidedDate = extractedDetails.date || null;
        const userProvidedTime = extractedDetails.time || null;
        const userProvidedLocation = extractedDetails.location || null;

        // Extract dates/times/locations from Serper snippets using AI FIRST (before display)
        let serperExtractedDate = null;
        let serperExtractedTime = null;
        let serperExtractedLocation = null;

        if (eventDetailsFromSerper?.found && eventDetailsFromSerper.rawSnippets?.length > 0) {
          // Use AI to extract structured data from Serper snippets
          const serperSnippetsText = eventDetailsFromSerper.rawSnippets.slice(0, 10).map((r, idx) => {
            // NO placeholders - only include if data exists
            let resultText = `[Result ${idx + 1}]\n`;
            if (r.title) resultText += `Title: ${r.title}\n`;
            if (r.snippet) resultText += `Content: ${r.snippet}\n`;
            return resultText;
          }).join('\n');

          const extractionPrompt = `Extract ONLY real dates, times, and locations from these REAL web search results (from Serper API/Google search) for "${eventTitle}".

REAL WEB SEARCH RESULTS FROM SERPER API (100% authentic web scraping):
${serperSnippetsText}

Return JSON:
{
  "date": "extracted date in ISO format (YYYY-MM-DD) or FIRST date from range like '2025-11-14' (for "November 14 and January 4, 2026" extract first date) or null if NOT found",
  "time": "extracted time in HH:MM format (24-hour) or START time from range like '16:00' or null if NOT found",
  "location": "extracted location or null if NOT found"
}

RULES:
- These are REAL search results from Serper API (Google search results)
- Extract dates/times/locations that are EXPLICITLY mentioned in the snippets above
- Look for patterns: "Date: October 18, 2025", "Time: 4 pm", "Location: Marine Park, Brooklyn", "November 14 and January 4, 2026", "between November 14 and January 4, 2026", etc.
- For date ranges like "November 14 and January 4, 2026" or "between November 14 and January 4, 2026", extract the FIRST date only as "2025-11-14" (or "2026-11-14" if year is 2026)
- For time ranges like "4 pm - 5 pm", extract the START time as "16:00"
- Convert all dates to ISO format (YYYY-MM-DD) - single date, not a range
- Convert all times to 24-hour format (HH:MM) - single time, not a range
- If date/time/location is NOT found, return null
- NEVER fabricate, guess, or assume
- Return ONLY valid JSON, no explanations, no markdown`;

          try {
            const extractionResponse = await axios.post(
              'https://openrouter.ai/api/v1/chat/completions',
              {
                model: 'openai/gpt-4o-mini',
                messages: [{ role: 'user', content: extractionPrompt }],
                temperature: 0.1,
                max_tokens: 200,
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

            const extractionContent = extractionResponse.data.choices[0]?.message?.content || '{}';
            const jsonMatch = extractionContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const extracted = JSON.parse(jsonMatch[0]);
              serperExtractedDate = extracted.date || null;
              serperExtractedTime = extracted.time || null;
              serperExtractedLocation = extracted.location || null;

              // Log what was extracted from REAL Serper API results
              logger.info(`[REAL SERPER DATA] Extracted from web scraping for "${eventTitle}":`, {
                date: serperExtractedDate || 'NOT FOUND in web results',
                time: serperExtractedTime || 'NOT FOUND in web results',
                location: serperExtractedLocation || 'NOT FOUND in web results',
                source: 'Serper API (Google search)',
                snippetCount: eventDetailsFromSerper.rawSnippets.length
              });
            }
          } catch (error) {
            logger.warn('Error extracting from Serper snippets:', error.message);
          }
        }

        // Build comprehensive context with top 10 for AI extraction, top 5 best for display
        let serperContext = '';
        let top5Snippets = [];
        if (eventDetailsFromSerper?.found && eventDetailsFromSerper.rawSnippets?.length > 0) {
          // Get top 5 best snippets for display (from user requirement: "only top 5 in best be show")
          top5Snippets = eventDetailsFromSerper.rawSnippets.slice(0, 5);

          serperContext = `\n\n═══════════════════════════════════════════════════\n`;
          serperContext += `WEB SEARCH RESULTS FOR "${eventTitle.toUpperCase()}" (Serper API - REAL DATA from web scraping):\n`;
          serperContext += `═══════════════════════════════════════════════════\n\n`;

          // Include top 10 raw snippets for AI extraction (more data for better extraction)
          eventDetailsFromSerper.rawSnippets.slice(0, 10).forEach((result, idx) => {
            serperContext += `[Search Result ${idx + 1}]\n`;
            if (result.title) serperContext += `Title: ${result.title}\n`;
            if (result.snippet) serperContext += `Content: ${result.snippet}\n`;
            if (result.link) serperContext += `Source: ${result.link}\n`;
            serperContext += `\n─────────────────────────────────────────────────────\n\n`;
          });

          serperContext += `═══════════════════════════════════════════════════\n`;
          serperContext += `END OF WEB SEARCH RESULTS\n`;
          serperContext += `═══════════════════════════════════════════════════\n\n`;
        }

        // Use Serper-extracted data if user didn't provide (prioritize user input)
        if (!userProvidedDate && serperExtractedDate) {
          extractedDetails.date = serperExtractedDate;
        }
        if (!userProvidedTime && serperExtractedTime) {
          extractedDetails.time = serperExtractedTime;
        }
        if (!userProvidedLocation && serperExtractedLocation) {
          extractedDetails.location = serperExtractedLocation;
        }

        // Update user-provided values after Serper extraction
        const finalUserProvidedDate = extractedDetails.date || null;
        const finalUserProvidedTime = extractedDetails.time || null;
        const finalUserProvidedLocation = extractedDetails.location || null;

        // Determine what's missing based on what we have (use Serper-extracted data)
        const hasDate = finalUserProvidedDate || serperExtractedDate;
        const hasTime = finalUserProvidedTime || serperExtractedTime;
        const hasLocation = finalUserProvidedLocation || serperExtractedLocation || userLocation;

        const missingInfo = [];
        if (!hasDate) missingInfo.push('date');
        if (!hasTime) missingInfo.push('time');
        if (!hasLocation) missingInfo.push('location');

        // Check if user provided new information or Serper extracted info
        const userProvidedNewInfo = finalUserProvidedDate || finalUserProvidedTime || finalUserProvidedLocation || serperExtractedDate || serperExtractedTime || serperExtractedLocation;
        const isFirstTime = !conversation.context?.creatingEvent?.shownEventCard;

        // Always show formatted display if first time or user provided new info
        if (missingInfo.length === 0 || isFirstTime || userProvidedNewInfo) {
          // Build top 5 best snippets and links sections (from user requirement: "only top 5 in best be show")
          let top5SnippetsSection = '';
          let top5LinksSection = '';

          if (top5Snippets.length > 0) {
            // Top 5 Best Snippets from Serper API - format with 3 complete sentences each
            // Use AI to format all snippets at once for better performance
            const snippetsForFormatting = top5Snippets.map((r, idx) => ({
              index: idx + 1,
              snippet: r.snippet || ''
            })).filter(s => s.snippet);

            if (snippetsForFormatting.length > 0) {
              try {
                const snippetsText = snippetsForFormatting.map(s => `Snippet ${s.index}: "${s.snippet}"`).join('\n\n');
                const snippetFormatPrompt = `Format these ${snippetsForFormatting.length} snippets. For EACH snippet, extract EXACTLY 3 complete sentences. 

CRITICAL REQUIREMENTS:
- Each snippet MUST have EXACTLY 3 complete sentences (no more, no less)
- Remove ALL "..." characters completely
- If a sentence is incomplete, complete it naturally based on context
- Each sentence must end with proper punctuation (., !, or ?)
- Sentences should be informative and related to the event
- Return in this EXACT format (numbering only):

1. [First complete sentence from snippet 1]. [Second complete sentence from snippet 1]. [Third complete sentence from snippet 1].

2. [First complete sentence from snippet 2]. [Second complete sentence from snippet 2]. [Third complete sentence from snippet 2].

[Continue for all ${snippetsForFormatting.length} snippets...]

Snippets to format:
${snippetsText}

Return the formatted snippets now (EXACTLY 3 sentences per snippet):`;

                const snippetResponse = await axios.post(
                  'https://openrouter.ai/api/v1/chat/completions',
                  {
                    model: 'openai/gpt-4o-mini',
                    messages: [{ role: 'user', content: snippetFormatPrompt }],
                    temperature: 0.1,
                    max_tokens: 1500,
                  },
                  {
                    headers: {
                      'Authorization': `Bearer ${config.openRouterApiKey}`,
                      'Content-Type': 'application/json',
                      'HTTP-Referer': 'https://event-chatbot.com',
                      'X-Title': 'Event Management Chatbot',
                    },
                    timeout: 15000,
                  }
                );

                let formattedSnippets = snippetResponse.data.choices[0]?.message?.content || '';
                // Clean up the formatted snippets - remove "..." as user requested
                formattedSnippets = formattedSnippets.replace(/\.\.\./g, '').trim();

                // Store formatted snippets without hardcoded labels - AI will add labels dynamically
                if (formattedSnippets.length > 50) {
                  top5SnippetsSection = formattedSnippets; // Just content, no hardcoded "Top 5 Best Snippets" label
                } else {
                  throw new Error('AI response too short');
                }
              } catch (error) {
                // Fallback: use raw snippets - AI will format them naturally in display prompt
                logger.warn('Error formatting snippets with AI, using raw snippets:', error.message);
                top5SnippetsSection = top5Snippets.map((s) => s.snippet || '').filter(s => s).join('\n\n'); // No numbering, no labels
              }
            }

            // Top 5 Best Links - store as array of links, AI will format naturally
            top5LinksSection = top5Snippets.map((result) => result.link || '').filter(link => link).join('\n');
          }

          // Use OpenRouter to dynamically generate ALL messages and formats - NO hardcoded text
          // Let AI naturally understand user intent and present information from Serper API
          let displayPrompt = `The user wants to create an event called "${eventTitle}". 

REAL WEB SEARCH DATA FROM SERPER API (100% authentic web scraping - if empty, tell user naturally):
${serperContext || ''}

TOP 5 BEST SNIPPETS FROM WEB SEARCH (these are REAL, actual information - if empty, don't show):
${top5SnippetsSection || ''}

TOP 5 BEST LINKS FROM WEB SEARCH (if empty, don't show):
${top5LinksSection || ''}

YOUR TASK - GENERATE EVERYTHING DYNAMICALLY (NO HARDCODED FORMATS):
1. Understand the user's intent completely - they want to create/view this event
2. Based on the REAL web search data above, dynamically generate:
   - A natural, conversational message acknowledging the user's request
   - A professionally formatted event card showing ONLY:
     * The event name: "${eventTitle}"
     * The top 5 best snippets you received (format them naturally with complete sentences, remove "..." if any)
     * The top 5 best links you received
   - A natural question asking if they want to edit or proceed with creation
   
3. CRITICAL RULES - DISPLAY ONLY THESE 3 THINGS (NOTHING ELSE):
   - Event Name (ONLY if real data exists)
   - Links (ONLY top 5 best from web search - if no links, don't show)
   - Snippets (ONLY top 5 best from web search - if no snippets, don't show)
   - ABSOLUTELY DO NOT show: Date, Time, Location, Mode, Price, or ANY other fields
   - If data doesn't exist, DO NOT show it - don't use current date/time or any defaults
   - ALL snippets and links must come from the REAL data provided above
   - If web search found no data, tell user naturally - don't show fake/placeholder data
   - Format everything professionally and naturally - NO rigid templates
   - NO placeholders, NO "TBD", NO fake data, NO current date/time - only use what's in the web search results
   - Generate ALL text dynamically - every message, every label, every question should be AI-generated
   - Make it feel natural and conversational, not templated
   
4. CONVERSATION FLOW:
   - User asked to create "${eventTitle}"
   - You searched and found real web data (shown above)
   - Present the event information naturally
   - Ask naturally if they want to edit or create with these details

Generate a complete, natural response with ALL text dynamically generated by you:`;

          let formattedDisplay = await generateResponse(displayPrompt, { lastIntent: 'create', isFirstSearch, eventTitle }, conversationHistory);

          // Remove ALL fields except Name, Links, Snippets - remove Date, Time, Location, Mode, Price, and ANY other fields
          formattedDisplay = formattedDisplay.replace(/\n\s*Date:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Location:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Time:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Day:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Month:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Mode:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Price:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Category:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Venue:\s*[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*Address:\s*[^\n]*/gi, '');
          // Remove any date/time patterns
          formattedDisplay = formattedDisplay.replace(/\n\s*\d{1,2}\/\d{1,2}\/\d{4}[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*\d{4}-\d{2}-\d{2}[^\n]*/gi, '');
          formattedDisplay = formattedDisplay.replace(/\n\s*\d{1,2}:\d{2}[^\n]*/gi, '');

          if (missingInfo.length === 0 || isFirstTime || userProvidedNewInfo) {
            // Use AI-generated display directly (no predefined prefixes)
            reply = formattedDisplay;

            // Mark that we've shown the event card and waiting for confirmation
            conversation.context.creatingEvent = {
              title: eventTitle,
              serperDetails: eventDetailsFromSerper,
              missingInfo: missingInfo.length === 0 ? [] : missingInfo,
              shownEventCard: true,
              waitingForConfirmation: true, // ALWAYS wait for confirmation when showing the creation card to avoid loop
              formattedDisplay: formattedDisplay,
              top5Snippets: top5Snippets,
              top5SnippetsSection: top5SnippetsSection,
              top5LinksSection: top5LinksSection,
              extractedDate: finalUserProvidedDate || serperExtractedDate,
              extractedTime: finalUserProvidedTime || serperExtractedTime,
              extractedLocation: finalUserProvidedLocation || serperExtractedLocation,
              serperExtractedDate: serperExtractedDate,
              serperExtractedTime: serperExtractedTime,
              serperExtractedLocation: serperExtractedLocation,
            };
          } else {
            // Missing info - use AI-generated display directly (no predefined prefixes)
            reply = formattedDisplay;

            conversation.context.creatingEvent = {
              title: eventTitle,
              serperDetails: eventDetailsFromSerper,
              missingInfo: missingInfo,
              shownEventCard: true,
              waitingForConfirmation: true, // ALWAYS wait for confirmation even if info is missing
              formattedDisplay: formattedDisplay,
              top5Snippets: top5Snippets,
              extractedDate: finalUserProvidedDate || serperExtractedDate,
              extractedTime: finalUserProvidedTime || serperExtractedTime,
              extractedLocation: finalUserProvidedLocation || serperExtractedLocation,
              serperExtractedDate: serperExtractedDate,
              serperExtractedTime: serperExtractedTime,
              serperExtractedLocation: serperExtractedLocation,
            };
          }

            conversation.markModified('context');
            const saveResultFinal = await safeSaveConversation(conversation);
            if (!saveResultFinal.success) {
              logger.error('[CHAT] Failed to save conversation', { sessionId: conversation.sessionId, error: saveResultFinal.error });
            }
            res.json({
              success: true,
              reply,
              sessionId: conversation.sessionId,
            });
            return;
        }

        // This code should never be reached due to the condition above, but keeping as safety fallback
        // If somehow we reach here, use general AI response
        reply = await generateResponse(message, { lastIntent: 'create', creatingEvent: true }, conversationHistory);
      }
    } else if (intent === 'discovery') {
      // NO predefined category keywords - use AI-extracted category from extractEventDetailsWithAI
      // The AI extraction service already handles category extraction, so use that
      let categoryForSearch = extractedDetails.category;

      // If no category extracted but there's event title, let AI determine category from context
      if (!categoryForSearch && extractedDetails.eventTitle && message) {
        // Use AI to extract category from the full context, not predefined keywords
        const categoryExtractionPrompt = `Analyze this event search query: "${message}"
Event title mentioned: "${extractedDetails.eventTitle || ''}"
Determine if there's an event category (e.g., sports, tech, music, art, business, conference, festival, workshop, seminar, concert, exhibition, cultural, etc.).
Return ONLY the category name as a single word, or "null" if no category can be determined.`;

        try {
          const categoryResponse = await generateResponse(categoryExtractionPrompt, { lastIntent: 'discovery' }, conversationHistory);
          const categoryLower = categoryResponse.toLowerCase().trim();
          if (categoryLower && categoryLower !== 'null' && categoryLower.length < 30) {
            categoryForSearch = categoryLower;
          }
        } catch (error) {
          logger.warn('Error extracting category with AI:', error);
        }
      }

      // Use AI-extracted details for search
      const searchFilters = {
        location: extractedDetails.location,
        category: categoryForSearch,
        date: extractedDetails.date,
        city: extractedDetails.useUserLocation && userLocation ? userLocation.city : null,
        region: extractedDetails.useUserLocation && userLocation ? userLocation.region : null,
      };

      const events = await searchEvents(message, searchFilters);

      if (events.length > 0) {
        // Remove duplicates
        const uniqueEvents = [];
        const seenTitles = new Set();
        const seenUrls = new Set();

        for (const event of events) {
          const titleKey = event.title.toLowerCase().trim();
          const urlKey = event.sourceUrl ? event.sourceUrl.toLowerCase().trim() : null;

          if (seenTitles.has(titleKey) || (urlKey && seenUrls.has(urlKey))) {
            continue;
          }

          let isDuplicate = false;
          for (const seenTitle of seenTitles) {
            const similarity = calculateSimilarity(titleKey, seenTitle);
            if (similarity > 0.9) {
              isDuplicate = true;
              break;
            }
          }

          if (!isDuplicate) {
            seenTitles.add(titleKey);
            if (urlKey) seenUrls.add(urlKey);
            uniqueEvents.push(event);
          }
        }

        conversation.context.lastSearchQuery = message;
        // Don't set lastEventIds here - events are plain objects without _id yet
        // Will be set after validation and saving

        // Use AI to validate and filter out fake/non-event results before showing
        // Include snippet information for better validation
        const eventsToValidate = uniqueEvents.slice(0, 15); // Validate more candidates

        // Build validation list with snippet information
        const eventsListForValidation = eventsToValidate.map((event, idx) => {
          const snippet = event.snippet || '';
          // NO placeholders - only show real data
          let eventText = `${idx + 1}. Title: "${event.title}"\n`;
          if (event.sourceUrl) eventText += `URL: ${event.sourceUrl}\n`;
          if (event.location) eventText += `Location: ${event.location}\n`;
          if (snippet) eventText += `Snippet: ${snippet.substring(0, 200)}\n`;
          return eventText.trim();
        }).join('\n\n');

        const batchValidationPrompt = `You are an event validator. Identify REAL, ATTENDABLE EVENTS that people can actually register for and attend.

INCLUDE events that are:
- Real events people can attend (conferences like CES, Web Summit, tech conferences, sports events, festivals, concerts, workshops, seminars)
- Have event-specific details in title or snippet (event name, mentions of dates, locations, tickets, registration)
- Appear to be actual event listings (even if location/date details need extraction)
- Known major events (CES, Web Summit, SXSW, etc.) - include these even if some details are missing
- Have snippet text suggesting it's a real event page

EXCLUDE:
- Articles, blog posts, news articles ABOUT events (not the event itself)
- Tools, platforms, databases, APIs, schemas
- Guides like "How to plan...", "Best practices for...", "Guide to..."
- Idea lists, "top 10" lists, directories
- Wikipedia pages, documentation
- Titles containing "Ideas for", "Best", "Guide to", "How to", "Tips for", "Ways to"
- URLs with /blog/, /article/, /wiki/, /guide/, /how-to/, /tips/, /ideas/

IMPORTANT: Be reasonable - if an event looks real (like "CES - The Most Powerful Tech Event" or "Web Summit"), include it even if location/date needs extraction. Prefer inclusion over exclusion for unclear cases.

Events to validate:
${eventsListForValidation}

Return ONLY a JSON array of valid event indices (starting from 1). Example: [1, 3, 5] or [2, 4] or [] if none are valid.`;

        let validatedEventIndices = [];
        try {
          logger.info(`[VALIDATION] Validating ${eventsToValidate.length} events with AI...`);
          const validationResponse = await generateResponse(batchValidationPrompt, { lastIntent: 'discovery' }, []);
          logger.info(`[VALIDATION] AI validation response: ${validationResponse.substring(0, 200)}...`);

          // Extract JSON array from response - try multiple patterns
          let jsonMatch = validationResponse.match(/\[[\d,\s]*\]/);
          if (!jsonMatch) {
            // Try to find JSON in code blocks
            jsonMatch = validationResponse.match(/```(?:json)?\s*(\[[\d,\s]*\])\s*```/);
            if (jsonMatch) jsonMatch[1] = jsonMatch[1];
          }
          if (!jsonMatch) {
            // Try to extract any array-like structure
            jsonMatch = validationResponse.match(/\[[0-9,\s]+\]/);
          }

          if (jsonMatch) {
            const jsonString = jsonMatch[1] || jsonMatch[0];
            try {
              validatedEventIndices = JSON.parse(jsonString).map(i => {
                const idx = parseInt(i) - 1; // Convert to 0-based indices
                return idx >= 0 && idx < eventsToValidate.length ? idx : -1;
              }).filter(idx => idx !== -1);
              logger.info(`[VALIDATION] Successfully parsed ${validatedEventIndices.length} validated indices`);
            } catch (parseError) {
              logger.warn('[VALIDATION] Error parsing JSON from validation response:', parseError);
              logger.warn('[VALIDATION] Raw JSON string:', jsonString);
            }
          } else {
            logger.warn('[VALIDATION] No JSON array found in validation response. Full response:', validationResponse);
          }
        } catch (error) {
          logger.warn('[VALIDATION] Error validating events with AI:', error);
        }

        // Fallback: If AI validation failed or returned empty, use basic filtering
        if (validatedEventIndices.length === 0) {
          logger.info('[VALIDATION] Using fallback filtering - AI validation returned no results');
          // No hardcoded filtering - include all events if AI validation fails
          // Let AI handle all validation, no fallback keyword matching
          validatedEventIndices = eventsToValidate.map((event, idx) => {
            // Only check if title exists - let AI handle all other validation
            return (event.title && event.title.length > 3) ? idx : -1;
          }).filter(idx => idx !== -1);
          logger.info(`[VALIDATION] Fallback filtering found ${validatedEventIndices.length} events (minimal check only)`);
        }

        // Log validation results for debugging
        logger.info(`[VALIDATION] AI validated ${validatedEventIndices.length} out of ${eventsToValidate.length} events`);
        logger.info(`[VALIDATION] Valid indices: ${JSON.stringify(validatedEventIndices)}`);

        // Filter validated events - be less strict about location
        let validatedEvents = validatedEventIndices
          .filter(idx => idx >= 0 && idx < eventsToValidate.length)
          .map(idx => eventsToValidate[idx])
          // Additional filtering: only remove events with explicitly "Location TBD"
          .filter(event => {
            // Only filter out events that explicitly say "Location TBD"
            if (event.location && (event.location === 'Location TBD' || event.location.toLowerCase().trim() === 'tbd')) {
              logger.info(`[VALIDATION] Filtered out event with TBD location: ${event.title}`);
              return false;
            }
            // Allow events without location - location might be in snippet or can be asked
            // Only filter if it's clearly a placeholder, not just missing
            return true;
          })
          .slice(0, 5); // Show max 5 validated events

        logger.info(`[VALIDATION] Final validated events count: ${validatedEvents.length}`);
        if (validatedEvents.length > 0) {
          logger.info(`[VALIDATION] Validated event titles: ${validatedEvents.map(e => e.title).join(', ')}`);
        }

        if (validatedEvents.length === 0) {
          // No real events found - use AI to naturally inform user
          const noEventsPrompt = `The user searched for "${message}" but no real, actual events were found in the web search results.
The search results contained only tools, websites, articles, databases, or schema definitions, not actual events that people can attend.
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, helpful message that:
1. Acknowledges their search
2. Explains that no actual events were found (only tools/articles)
3. Suggests what they can try instead (refine search, different terms, etc.)
4. Be professional and helpful

Generate ALL text dynamically - be natural and conversational, not templated.`;
          reply = await generateResponse(noEventsPrompt, { lastIntent: 'discovery', searchQuery: message }, conversationHistory);
        } else {
          const eventsToShow = validatedEvents.slice(0, 5);
          logger.info(`[DISPLAY] Showing ${eventsToShow.length} validated events to user`);

          // Format events: Only name and link
          const eventsList = eventsToShow.map((event, idx) => {
            const link = event.sourceUrl && event.sourceUrl.startsWith('http') ? event.sourceUrl : 'N/A';
            return `${idx + 1}. ${event.title}\n   ${link}`;
          }).join('\n\n');

          // Get top 5 best snippets from validated events (snippets are already stored in event.snippet)
          const topSnippets = eventsToShow
            .map(event => event.snippet || '') // Get snippet from validated event
            .filter(snippet => snippet && snippet.trim().length > 20) // Only meaningful snippets
            .slice(0, 5)
            .map((snippet, idx) => {
              const cleanSnippet = snippet.trim().substring(0, 300);
              return `${idx + 1}. ${cleanSnippet}${snippet.trim().length > 300 ? '...' : ''}`;
            })
            .join('\n\n');

          // Save validated events to database (they were only candidates before)
          const savedEventIds = [];
          for (const eventData of eventsToShow) {
            try {
              // Check if event already exists to avoid duplicates
              const existingEvent = await Event.findOne({
                $or: [
                  { title: eventData.title, source: { $in: ['serpapi', 'serper'] } },
                  { sourceUrl: eventData.sourceUrl, source: { $in: ['serpapi', 'serper'] } }
                ]
              });

              if (!existingEvent) {
                // Event is validated and doesn't exist, save it with userId (discovered by this user)
                const event = new Event({
                  ...eventData,
                  userId: userId, // Mark as discovered by this user
                });
                await event.save();
                savedEventIds.push(event._id);
                logger.info(`✅ Validated event saved (discovered by user): ${eventData.title}`);
              } else {
                // Event exists - check if this user already discovered it
                // If event has different userId, create a new entry for this user's discovery
                // OR if userId matches, use existing event
                if (existingEvent.userId && existingEvent.userId.toString() === userId.toString()) {
                  // User already discovered this event
                  savedEventIds.push(existingEvent._id);
                  logger.info(`Event already discovered by this user: ${eventData.title}`);
                } else {
                  // Event exists but discovered by different user - create new entry for this user
                  const event = new Event({
                    ...eventData,
                    userId: userId, // Mark as discovered by this user
                  });
                  await event.save();
                  savedEventIds.push(event._id);
                  logger.info(`✅ Event saved as new discovery for this user: ${eventData.title}`);
                }
              }
            } catch (error) {
              logger.warn(`Error saving validated event "${eventData.title}":`, error.message);
            }
          }

          // Update context with validated events
          conversation.context.lastSearchQuery = message;
          conversation.context.lastEventIds = savedEventIds;

          // Use AI to generate discovery response - ONLY name, links, snippets (NOTHING ELSE)
          const discoveryPrompt = `The user searched for "${message}". You found ${eventsToShow.length} real event(s). 

EVENTS (Name and Link only):
${eventsList}

TOP 5 BEST SNIPPETS FROM SEARCH (if empty, don't show):
${topSnippets || ''}

Generate a natural, professional response that:
1. Directly presents the events you found - NO "Let me gather", NO "Just a moment", NO processing messages
2. Shows ONLY these 3 things (NOTHING ELSE):
   - Event names
   - Links (only if real links exist)
   - Snippets (only if real snippets exist)
3. ABSOLUTELY DO NOT show: date, time, location, mode, price, or ANY other fields
4. If data doesn't exist, DON'T show it - don't use current date/time or any defaults
5. Keep it concise and helpful - start directly with the events, no preamble
6. Format clearly with event names and links prominently displayed

CRITICAL RULES:
- Show ONLY event name, links, and snippets. If any of these don't exist, don't show them.
- Do NOT show date, time, location, mode, price, or anything else.
- Do NOT say "Let me gather", "Just a moment", "I can help with that", or any processing messages
- Start directly with the events you found - be immediate and direct

Generate ALL text dynamically - be natural and conversational, but direct.`;
          reply = await generateResponse(discoveryPrompt, { lastIntent: 'discovery', eventCount: eventsToShow.length }, conversationHistory);
        }
      } else {
        // Use AI to generate response when no events found
        // For discovery queries, be direct - no processing messages
        const noEventsPrompt = `The user searched for "${message}" but no events were found.

Generate a direct, helpful response that:
1. Acknowledges no events were found
2. Suggests alternative searches or actions
3. Do NOT say "Let me gather", "Just a moment", or any processing messages
4. Be direct and helpful

Generate ALL text dynamically - be natural but direct.`;
        reply = await generateResponse(noEventsPrompt, { lastIntent: 'discovery', searchQuery: message }, conversationHistory);
      }
    } else if (intent === 'registration') {
      // Check if user mentioned an event name - if so, search for it first
      const eventName = extractedDetails.eventTitle;
      if (eventName && (!conversation.context.lastEventIds || conversation.context.lastEventIds.length === 0)) {
        // User wants to register for a specific event - search for it first
        logger.info(`User wants to register for "${eventName}" - searching for events first...`);
        const searchFilters = {
          location: extractedDetails.location,
          category: extractedDetails.category,
          date: extractedDetails.date,
          city: extractedDetails.useUserLocation && userLocation ? userLocation.city : null,
          region: extractedDetails.useUserLocation && userLocation ? userLocation.region : null,
        };

        const events = await searchEvents(eventName, searchFilters);

        if (events.length > 0) {
          // Events are plain objects, need to save them first to get _id
          // For now, just store the search query - will save events when user selects one
          conversation.context.lastSearchQuery = eventName;
          conversation.context.foundEventsForRegistration = events.slice(0, 5); // Store plain objects

          // Show events to user - ONLY name, link, and snippets
          const eventsList = events.slice(0, 5).map((event, idx) => {
            let eventDetails = `\nEvent ${idx + 1}: ${event.title}\n`;

            // Only add link if it's a real URL
            if (event.sourceUrl && event.sourceUrl !== 'N/A' && event.sourceUrl.startsWith('http')) {
              eventDetails += `Link: ${event.sourceUrl}\n`;
            }

            // Add snippets if available
            if (event.snippet) {
              const snippets = event.snippet.split('.').slice(0, 5).map(s => s.trim()).filter(s => s.length > 0);
              if (snippets.length > 0) {
                eventDetails += `\nSnippets:\n`;
                snippets.forEach((s, sIdx) => {
                  eventDetails += `- ${s}${sIdx < snippets.length - 1 ? '.' : ''}\n`;
                });
              }
            }

            eventDetails += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            return eventDetails;
          }).join('\n');

          const registrationSearchPrompt = `The user wants to register for "${eventName}". You found ${events.length} event(s) related to this.

Event details (ONLY name, links, and snippets - NOTHING ELSE):
${eventsList}

Generate a professional message that:
1. Presents these events showing ONLY: event name, links, and snippets
2. ABSOLUTELY DO NOT mention: date, time, location, mode, price, or ANY other fields
3. If data doesn't exist, DON'T show it - don't use current date/time or any defaults
4. Asks which one they would like to register for
5. Guides them on how to select an event

CRITICAL: Show ONLY event name, links, and snippets. If any don't exist, don't show them. Do NOT show date, time, location, mode, price, or anything else.

Generate ALL text dynamically - be natural and professional.`;
          reply = await generateResponse(registrationSearchPrompt, { lastIntent: 'registration', eventName, eventCount: events.length }, conversationHistory);
          conversation.markModified('context');
          const saveResult8 = await safeSaveConversation(conversation);
          if (!saveResult8.success) {
            logger.error('[CHAT] Failed to save conversation (registration search)', { sessionId: conversation.sessionId, error: saveResult8.error });
          }
          res.json({
            success: true,
            reply,
            sessionId: conversation.sessionId,
          });
          return;
        } else {
          // No events found - use AI to suggest alternatives
          const noEventsPrompt = `The user wants to register for "${eventName}" but you couldn't find any upcoming events for it.
Generate a professional message suggesting alternatives like searching with different criteria or creating a new event.`;
          reply = await generateResponse(noEventsPrompt, { lastIntent: 'registration', eventName }, conversationHistory);
          conversation.markModified('context');
          const saveResult9 = await safeSaveConversation(conversation);
          if (!saveResult9.success) {
            logger.error('[CHAT] Failed to save conversation (no events)', { sessionId: conversation.sessionId, error: saveResult9.error });
          }
          res.json({
            success: true,
            reply,
            sessionId: conversation.sessionId,
          });
          return;
        }
      }

      // Check if user is selecting an event from foundEventsForRegistration
      let selectedEvent = null;
      let eventId = null;

      if (conversation.context.foundEventsForRegistration && conversation.context.foundEventsForRegistration.length > 0) {
        // User might be selecting an event by number (e.g., "register for event 1")
        // NO regex patterns - use AI to extract event number from message
        const foundEventsForRegistration = conversation.context.foundEventsForRegistration;
        let eventIndex = -1;
        try {
          const eventNumberPrompt = `The user wants to register for an event. They said: "${message}"
Available events are numbered 1 to ${foundEventsForRegistration.length}.

Extract the event number the user wants to register for. Return ONLY a number (1-${foundEventsForRegistration.length}) or "null" if unclear.`;

          const numberResponse = await generateResponse(eventNumberPrompt, { lastIntent: 'registration' }, conversationHistory);
          const numberMatch = numberResponse.match(/\d+/);
          if (numberMatch) {
            const selectedNumber = parseInt(numberMatch[0]);
            if (selectedNumber >= 1 && selectedNumber <= foundEventsForRegistration.length) {
              eventIndex = selectedNumber - 1;
            }
          }
        } catch (error) {
          logger.warn('Error extracting event number with AI:', error);
        }

        if (eventIndex >= 0 && eventIndex < foundEventsForRegistration.length) {
          const eventData = foundEventsForRegistration[eventIndex];
          // Check if event already exists in database
          const existingEvent = await Event.findOne({
            $or: [
              { title: eventData.title, source: 'serper' },
              { sourceUrl: eventData.sourceUrl, source: 'serper' }
            ]
          });

          if (existingEvent) {
            eventId = existingEvent._id;
            selectedEvent = existingEvent;
          } else {
            // Save event to database first
            const newEvent = new Event(eventData);
            await newEvent.save();
            eventId = newEvent._id;
            selectedEvent = newEvent;
            logger.info(`Event saved for registration: ${eventData.title}`);
          }

          // Update lastEventIds for future use
          if (!conversation.context.lastEventIds) {
            conversation.context.lastEventIds = [];
          }
          conversation.context.lastEventIds.unshift(eventId);
          conversation.context.lastEventIds = conversation.context.lastEventIds.slice(0, 5);
        }
      }

      // If no event selected from foundEventsForRegistration, try lastEventIds
      if (!selectedEvent) {
        const lastEventIds = conversation.context.lastEventIds || [];
        if (lastEventIds.length > 0) {
          eventId = lastEventIds[0];
          selectedEvent = await getEventById(eventId);
        }
      }

      if (selectedEvent && eventId) {
        // Use AI to extract name and email from message
        const extractPrompt = `Extract name and email from this message: "${message}"
Return ONLY a valid JSON object with this structure: {"name": "extracted name or null", "email": "extracted email or null"}
No explanations, no markdown, just JSON.`;

        const extractResponse = await generateResponse(extractPrompt, { lastIntent: 'registration' }, conversationHistory);
        let extractedInfo = { name: null, email: null };

        try {
          // Try to parse JSON from AI response
          const jsonMatch = extractResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedInfo = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          logger.warn('Could not parse extracted info from AI response');
        }

        const name = extractedInfo.name || user.username;
        const email = extractedInfo.email || user.email;

        const registrationResult = await createRegistration(userId, eventId, name, email);

        if (registrationResult.success) {
          // Build registration details with ONLY real data - no TBD, no defaults
          // ONLY show event name, link, and snippets - NO date, time, location, mode, price
          let registrationDetails = `Event Title: ${selectedEvent.title}\n`;

          // Only add link if it's a real URL
          if (selectedEvent.sourceUrl && selectedEvent.sourceUrl.startsWith('http')) {
            registrationDetails += `Event Link: ${selectedEvent.sourceUrl}\n`;
          }

          // Add snippets if available
          if (selectedEvent.snippet) {
            const snippets = selectedEvent.snippet.split('.').slice(0, 5).map(s => s.trim()).filter(s => s.length > 0);
            if (snippets.length > 0) {
              registrationDetails += `\nSnippets:\n`;
              snippets.forEach((s, sIdx) => {
                registrationDetails += `- ${s}${sIdx < snippets.length - 1 ? '.' : ''}\n`;
              });
            }
          }

          registrationDetails += `Email: ${email}`;

          const registrationConfirmPrompt = `The user has successfully registered for an event.
Event details (ONLY name, link, and snippets - NOTHING ELSE):
${registrationDetails}
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, professional confirmation message that:
1. Confirms successful registration
2. Shows ONLY these 3 things (NOTHING ELSE):
   - Event name
   - Link (only if real link exists)
   - Snippets (only if real snippets exist)
3. ABSOLUTELY DO NOT mention: date, time, location, mode, price, or ANY other fields
4. If data doesn't exist, DON'T show it - don't use current date/time or any defaults
5. Mentions they will receive further details via email
6. Be clear and professional

CRITICAL: Show ONLY event name, links, and snippets. If any don't exist, don't show them. Do NOT show date, time, location, mode, price, or anything else.

Generate ALL text dynamically - be natural and conversational.`;
          reply = await generateResponse(registrationConfirmPrompt, { lastIntent: 'registration', eventTitle: selectedEvent.title }, conversationHistory);

          // --- Feature Enhancement: Add Calendar, QR, and Share ---
          const eventDateStr = selectedEvent.startDate ? new Date(selectedEvent.startDate).toISOString().replace(/-|:|\.\d\d\d/g, "") : "";
          const eventEndDateStr = selectedEvent.endDate ? new Date(selectedEvent.endDate).toISOString().replace(/-|:|\.\d\d\d/g, "") : (eventDateStr ? new Date(new Date(selectedEvent.startDate).getTime() + 3600000).toISOString().replace(/-|:|\.\d\d\d/g, "") : "");

          let featuresHtml = "\n\n<div style='margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;'>";

          // 1. Google Calendar
          if (eventDateStr) {
            const encodedTitle = encodeURIComponent(selectedEvent.title);
            const encodedDetails = encodeURIComponent(`Event Link: ${selectedEvent.sourceUrl || 'N/A'}`);
            const encodedLocation = encodeURIComponent(selectedEvent.location || 'Online');
            const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${eventDateStr}/${eventEndDateStr}&details=${encodedDetails}&location=${encodedLocation}`;
            featuresHtml += `<a href="${gCalUrl}" target="_blank" style="background: #4285F4; color: white; padding: 8px 12px; border-radius: 4px; text-decoration: none; font-size: 0.8rem; display: inline-flex; align-items: center;">📅 Add to Calendar</a>`;
          }

          // 2. Share Button (mailto)
          const shareSubject = encodeURIComponent(`Check out this event: ${selectedEvent.title}`);
          const shareBody = encodeURIComponent(`I registered for ${selectedEvent.title}. Check it out here: ${selectedEvent.sourceUrl || ''}`);
          featuresHtml += `<a href="mailto:?subject=${shareSubject}&body=${shareBody}" style="background: #25D366; color: white; padding: 8px 12px; border-radius: 4px; text-decoration: none; font-size: 0.8rem; display: inline-flex; align-items: center;">🔗 Share Event</a>`;
          featuresHtml += "</div>";

          // 3. QR Code Ticket
          featuresHtml += `<div style='margin-top: 15px; background: white; padding: 10px; display: inline-block; border-radius: 8px;'>`;
          featuresHtml += `<div style='color: black; font-size: 0.8rem; font-weight: bold; margin-bottom: 5px; text-align: center;'>Your Ticket</div>`;
          featuresHtml += `<img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(registrationResult.registrationId || 'TICKET')}" alt="Ticket QR" />`;
          featuresHtml += `</div>`;

          reply += featuresHtml;
        } else {
          // Use AI to generate error message
          const errorPrompt = `Registration failed.
Error: ${registrationResult.error || 'Unknown error'}
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, helpful error message that:
1. Acknowledges the registration failure
2. Explains what went wrong (use the error information)
3. Suggests what the user can do next
4. Be professional and helpful

Generate ALL text dynamically - be natural and helpful.`;
          reply = await generateResponse(errorPrompt, { lastIntent: 'registration' }, conversationHistory);
        }
      } else {
        // Use AI to generate helpful message
        const prompt = `The user wants to register for an event but hasn't selected a specific event yet. 
Generate a professional, helpful message guiding them to search for events first or select from the events list if events were shown.`;
        reply = await generateResponse(prompt, { lastIntent: 'registration' }, conversationHistory);
      }

      const saveResultD = await safeSaveConversation(conversation);
      if (!saveResultD.success) {
        logger.error('[CHAT] Failed to save conversation (registration)', { sessionId: conversation.sessionId, error: saveResultD.error });
      }
      res.json({
        success: true,
        reply,
        sessionId: conversation.sessionId,
        refreshEvents: true,
      });
      return;
    } else if (intent === 'reminder') {
      const lastEventIds = conversation.context.lastEventIds || [];
      const userRegistrations = await getUserRegistrations(userId);

      // Use AI to extract reminder date
      let reminderDate = null;
      if (extractedDetails.date) {
        reminderDate = await parseDateWithAI(extractedDetails.date, conversationHistory);
      }

      if (lastEventIds.length > 0) {
        const reminderEventId = lastEventIds[0];
        const reminderEvent = await getEventById(reminderEventId);

        if (reminderEvent) {
          if (!reminderDate) {
            reminderDate = new Date(reminderEvent.startDate);
            reminderDate.setDate(reminderDate.getDate() - 1);
          }

          const reminderResult = await createReminder(userId, reminderEventId, reminderDate);

          if (reminderResult.success) {
            const reminderConfirmPrompt3 = `A reminder has been successfully set for the event "${reminderEvent.title}" on ${reminderDate.toLocaleDateString()}.
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, professional confirmation message that:
1. Confirms the reminder was set successfully
2. Mentions the event name and date naturally
3. States that the user will be notified
4. Be concise and professional

Generate ALL text dynamically - be natural and conversational.`;
            reply = await generateResponse(reminderConfirmPrompt3, { lastIntent: 'reminder', eventTitle: reminderEvent.title, reminderDate: reminderDate.toLocaleDateString() }, conversationHistory);
          } else {
            // Use AI to generate error message
            const errorPrompt = `Reminder creation failed due to: ${reminderResult.error || 'Unknown error'}.
Generate a professional explanation and guidance.`;
            reply = await generateResponse(errorPrompt, { lastIntent: 'reminder' }, conversationHistory);
          }
        } else {
          // Use AI to generate helpful message
          const prompt = `The user wants to set a reminder for an event but hasn't searched for any events yet.
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, helpful message that:
1. Acknowledges their request
2. Explains they need to search for events first
3. Guides them on how to search
4. Be professional and helpful

Generate ALL text dynamically - be natural and conversational.`;
          reply = await generateResponse(prompt, { lastIntent: 'reminder' }, conversationHistory);
        }
      } else if (userRegistrations.length > 0) {
        const eventId = userRegistrations[0].eventId;
        const event = await getEventById(eventId);

        if (event) {
          if (!reminderDate) {
            reminderDate = new Date(event.startDate);
            reminderDate.setDate(reminderDate.getDate() - 1);
          }

          const reminderResult = await createReminder(userId, eventId, reminderDate);
          if (reminderResult.success) {
            const reminderConfirmPrompt2 = `A reminder has been successfully set for the event "${event.title}" on ${reminderDate.toLocaleDateString()}.
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, professional confirmation message that:
1. Confirms the reminder was set successfully
2. Mentions the event name and date naturally
3. States that the user will be notified
4. Be concise and professional

Generate ALL text dynamically - be natural and conversational.`;
            reply = await generateResponse(reminderConfirmPrompt2, { lastIntent: 'reminder', eventTitle: event.title, reminderDate: reminderDate.toLocaleDateString() }, conversationHistory);
          } else {
            // Use AI to generate error message
            const errorPrompt = `Reminder creation failed due to: ${reminderResult.error || 'Unknown error'}.
Generate a professional explanation and guidance.`;
            reply = await generateResponse(errorPrompt, { lastIntent: 'reminder' }, conversationHistory);
          }
        } else {
          // Use AI to generate helpful message
          const prompt = `The user wants to set a reminder but hasn't registered for any events yet.
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, helpful message that:
1. Acknowledges their request
2. Explains they need to register for an event first
3. Guides them on how to register
4. Be professional and helpful

Generate ALL text dynamically - be natural and conversational.`;
          reply = await generateResponse(prompt, { lastIntent: 'reminder' }, conversationHistory);
        }
      } else {
        // Use AI to generate helpful message
        const prompt = `The user wants to set a reminder for an event but hasn't searched for or created any events yet.
Conversation context: ${JSON.stringify(conversationHistory.slice(-3).map(m => m.content))}

Generate a natural, helpful message that:
1. Acknowledges their request
2. Explains they need to search for or create an event first
3. Guides them on what they can do
4. Be professional and helpful

Generate ALL text dynamically - be natural and conversational.`;
        reply = await generateResponse(prompt, { lastIntent: 'reminder' }, conversationHistory);
      }
    } else {
      // For general intents, use AI with full context
      const enhancedContext = {
        ...conversation.context,
        lastIntent: conversation.lastIntent,
        userLocation: userLocation ? {
          city: userLocation.city,
          region: userLocation.region,
          country: userLocation.country,
        } : null,
        eventDetails: extractedDetails,
      };
      reply = await generateResponse(message, enhancedContext, conversationHistory);
    }

    conversation.messages.push({
      role: 'assistant',
      content: reply,
      timestamp: new Date(),
    });

    conversation.markModified('messages');
    conversation.markModified('context');
    
    // Critical: Ensure conversation is persisted before responding
    const saveResult = await safeSaveConversation(conversation);
    if (!saveResult.success) {
      logger.error('[CHAT] Failed to save conversation after message processing', {
        sessionId: conversation.sessionId,
        userId: userId,
        error: saveResult.error
      });
      // Continue execution - user already got response, but log the failure
      // In production, consider alerting/monitoring
    }

    // Generate contextual suggestions based on intent and context
    const discoveredEvents = conversation.context?.lastEventIds 
      ? await Event.find({ _id: { $in: conversation.context.lastEventIds } }).limit(3).lean()
      : [];
    
    // Check if the search was location-based
    // Use extractedDetails.useUserLocation if available, otherwise check message keywords
    const lastSearchQuery = conversation.context?.lastSearchQuery || message || '';
    const messageLower = lastSearchQuery.toLowerCase();
    const isLocationBased = extractedDetails.useUserLocation || (
      messageLower.includes('near me') ||
      messageLower.includes('nearby') ||
      messageLower.includes('in my city') ||
      messageLower.includes('in my area') ||
      messageLower.includes('close to me') ||
      messageLower.includes('around me') ||
      messageLower.includes('local events') ||
      messageLower.includes('events near') ||
      (userLocation && messageLower.includes(userLocation.city?.toLowerCase() || ''))
    );
    
    const suggestionContext = {
      events: discoveredEvents,
      eventCreated: intent === 'create' && reply.includes('successfully created'),
      registered: intent === 'registration' && reply.includes('successfully registered'),
      reminderSet: intent === 'reminder' && reply.includes('reminder'),
      userLocation: userLocation ? {
        lat: userLocation.lat,
        lng: userLocation.lon,
        city: userLocation.city,
        region: userLocation.region
      } : null,
      isLocationBased: isLocationBased && !!userLocation, // Only true if user has location AND search is location-based
      conversationHistory: conversationHistory.slice(-5), // Last 5 messages for context
      lastIntent: intent,
      reply: reply // AI's response to understand context
    };
    
    // Use AI to generate context-aware suggestions based on conversation
    let suggestions = [];
    try {
      const aiSuggestionPrompt = `You are a helpful assistant generating contextual suggestions for a user based on the conversation.

Conversation context:
${conversationHistory.slice(-3).map(m => `${m.role}: ${m.content.substring(0, 200)}`).join('\n')}

Your latest response: "${reply.substring(0, 300)}"

User's current intent: ${intent}
${discoveredEvents.length > 0 ? `Events found: ${discoveredEvents.map(e => e.title).join(', ')}` : ''}
${userLocation ? `User location: ${userLocation.city}, ${userLocation.region}` : 'User location: Not available'}

Generate 3-4 short, actionable suggestions (max 6 words each) that:
1. Are directly relevant to what the user just asked or what you just responded with
2. Help the user take the next logical step in their journey
3. Are specific and actionable (not generic)
4. Match the user's current needs based on conversation flow

Examples:
- If user searched for events → suggest "Register for [event name]", "View on map", "Find more events"
- If user created event → suggest "View in sidebar", "Create another event", "Share event"
- If user registered → suggest "Set reminder", "View my events", "Find similar events"
- If conversation is general → suggest "Find events near me", "Create an event", "Show my events"

Return ONLY a JSON array of suggestion strings, no explanation. Example: ["Register for Tech Summit", "View on map", "Set reminder"]`;
      
      const aiSuggestionResponse = await generateResponse(aiSuggestionPrompt, { lastIntent: intent }, conversationHistory);
      
      // Try to extract JSON array from AI response
      let jsonMatch = aiSuggestionResponse.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        try {
          suggestions = JSON.parse(jsonMatch[0]);
          if (!Array.isArray(suggestions)) {
            suggestions = [];
          }
        } catch (parseError) {
          logger.warn('[SUGGESTIONS] Failed to parse AI suggestions JSON:', parseError);
        }
      }
      
      // Fallback to rule-based if AI fails
      if (suggestions.length === 0) {
        suggestions = generateContextualSuggestions(intent, suggestionContext);
      }
    } catch (error) {
      logger.warn('[SUGGESTIONS] Error generating AI suggestions, using fallback:', error);
      suggestions = generateContextualSuggestions(intent, suggestionContext);
    }

    // Get event data if events were discovered
    let eventData = null;
    if (intent === 'discovery' && conversation.context?.lastEventIds && conversation.context.lastEventIds.length > 0) {
      const firstEvent = await Event.findById(conversation.context.lastEventIds[0]);
      if (firstEvent) {
        eventData = {
          _id: firstEvent._id,
          title: firstEvent.title,
          location: firstEvent.location,
          startDate: firstEvent.startDate,
          sourceUrl: firstEvent.sourceUrl
        };
      }
    }

    res.json({
      success: true,
      reply,
      sessionId: conversation.sessionId,
      refreshEvents: false, // Don't auto-refresh - user must save manually
      suggestions, // Add contextual suggestions
      eventData, // Include event data for save/remind buttons
    });
  } catch (error) {
    logger.error('Chat error:', error);
    res.status(500).json({ success: false, error: 'An error occurred while processing your message' });
  }
};

// Helper function for similarity calculation
const calculateSimilarity = (s1, s2) => {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
};

const editDistance = (s1, s2) => {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0)
        costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1))
            newValue = Math.min(newValue, lastValue, costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0)
      costs[s2.length] = lastValue;
  }
  return costs[s2.length];
};
