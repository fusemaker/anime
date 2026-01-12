import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';
import Event from '../models/Event.js';

// Helper function to search with SerpAPI (primary) - serpapi.com
const searchWithSerpAPI = async (searchQuery) => {
  try {
    logger.info(`[SERPAPI] Attempting search with SerpAPI: ${searchQuery}`);
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        q: searchQuery,
        api_key: config.serpApiKey,
        engine: 'google',
        num: 20,
      },
      timeout: 20000,
    });

    // SerpAPI returns results in organic_results field
    const results = response.data?.organic_results || [];
    logger.info(`[SERPAPI] Successfully retrieved ${results.length} results from SerpAPI`);

    // Convert SerpAPI format to our standard format
    return results.map(result => ({
      title: result.title || '',
      snippet: result.snippet || '',
      link: result.link || result.url || '',
    }));
  } catch (error) {
    logger.warn(`[SERPAPI] Error: ${error.response?.status} - ${error.message}`);
    throw error; // Throw to trigger fallback
  }
};

// Helper function to search with Serper API (fallback) - serper.dev
const searchWithSerper = async (searchQuery) => {
  try {
    logger.info(`[SERPER] Attempting search with Serper (fallback): ${searchQuery}`);
    const response = await axios.post(
      'https://google.serper.dev/search',
      {
        q: searchQuery,
        num: 20,
      },
      {
        headers: {
          'X-API-KEY': config.serperApiKey,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const results = response.data?.organic || [];
    logger.info(`[SERPER] Successfully retrieved ${results.length} results from Serper`);

    // Serper format is already compatible
    return results.map(result => ({
      title: result.title || '',
      snippet: result.snippet || '',
      link: result.link || '',
    }));
  } catch (error) {
    logger.error(`[SERPER] Error: ${error.response?.status} - ${error.message}`);
    throw error;
  }
};

export const searchEvents = async (query, filters = {}) => {
  try {
    const { location, category, date, city, region } = filters;

    // Build search query to find actual events, not tools/articles
    let cleanQuery = (query || 'upcoming events').trim();

    if (!cleanQuery || cleanQuery.length < 2) {
      cleanQuery = 'upcoming events';
    }

    // Let AI handle query cleaning - no hardcoded word removal

    // Use category from AI extraction if provided, otherwise extract from query
    let categoryToUse = category || cleanQuery;

    // Build event-specific search query with better targeting
    let searchQuery = '';

    // Construct a simpler, more effective query
    if (city || region || location) {
      const loc = city || region || location;
      searchQuery = `${categoryToUse} events in ${loc}`;
    } else {
      searchQuery = `${categoryToUse} events`;
    }

    // Add date context if provided
    if (date) {
      searchQuery += ` ${date}`;
    } else {
      const currentYear = new Date().getFullYear();
      // Just add the current year and 'upcoming'
      searchQuery += ` ${currentYear} upcoming`;
    }

    // Add OPTIONAL keywords for better relevance (without quotes to allow fuzzy matching)
    searchQuery += ' tickets registration';

    // Exclude common non-event content domains
    searchQuery += ' -site:calendly.com -site:doodle.com -site:translate.google.com -site:schema.org';
    searchQuery += ' -site:medium.com -site:wikipedia.org -site:reddit.com';
    searchQuery += ' -"how to" -"best practices" -"guide to" -"tips for" -"ideas for"';
    searchQuery += ' -inurl:blog -inurl:article -inurl:wiki -inurl:guide';

    logger.info(`[SEARCH] Query: ${searchQuery}`);

    // Try SerpAPI first, fallback to Serper if it fails
    let results = [];
    let apiUsed = 'none';
    try {
      results = await searchWithSerpAPI(searchQuery);
      apiUsed = 'serpapi';
      logger.info(`[SEARCH] Using SerpAPI results (${results.length} results)`);
    } catch (serpApiError) {
      logger.warn(`[SEARCH] SerpAPI failed, falling back to Serper: ${serpApiError.message}`);
      if (config.serperApiKey) {
        try {
          results = await searchWithSerper(searchQuery);
          apiUsed = 'serper';
          logger.info(`[SEARCH] Using Serper fallback results (${results.length} results)`);
        } catch (serperError) {
          logger.error(`[SEARCH] Both APIs failed. SerpAPI: ${serpApiError.message}, Serper: ${serperError.message}`);
          return [];
        }
      } else {
        logger.error(`[SEARCH] SerpAPI failed and no Serper API key configured`);
        return [];
      }
    }
    const events = [];
    const seenTitles = new Set();
    const seenUrls = new Set();

    for (const result of results) {
      try {
        let eventDate;

        // Parse date if provided - NO predefined patterns, use AI-parsed date directly
        if (date) {
          eventDate = new Date(date);
          if (isNaN(eventDate.getTime())) {
            // If date parsing fails, use today's date (AI will handle date parsing)
            eventDate = new Date();
          }
        } else {
          eventDate = new Date();
        }

        // Extract basic info (both APIs use same structure after conversion)
        const title = result.title || '';
        const resultSnippet = result.snippet || '';
        const link = result.link || '';

        const eventTitle = title.trim();

        // Skip if title is empty (minimal check - AI will validate everything else)
        if (!eventTitle || eventTitle.length < 3) {
          continue;
        }

        // Use filter location if provided, otherwise let AI extract from snippets later
        let eventLocation = city || location || null;

        // Check for duplicates in current batch (simple string comparison)
        const titleKey = eventTitle.toLowerCase().trim();
        const urlKey = link.toLowerCase().trim();

        if (seenTitles.has(titleKey) || (urlKey && seenUrls.has(urlKey))) {
          continue; // Skip duplicate in same search
        }

        seenTitles.add(titleKey);
        if (urlKey) seenUrls.add(urlKey);

        // Let AI determine mode from snippets - NO defaults
        let eventMode = null; // AI will extract real mode from snippets, no default

        const eventData = {
          title: eventTitle,
          category: category || null, // NO default - AI will extract from context
          location: eventLocation,
          mode: eventMode,
          price: null, // AI will extract real prices from snippets - NO default
          source: apiUsed, // Track which API was used
          sourceUrl: link,
          startDate: eventDate,
          snippet: resultSnippet, // Store snippet for validation
        };

        // Basic deduplication check - use exact string matching, not regex
        const existingEvent = await Event.findOne({
          $or: [
            // Exact title match (case-insensitive via MongoDB)
            {
              title: new RegExp(`^${eventData.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
              source: { $in: ['serpapi', 'serper'] } // Check both sources
            },
            // Same source URL (exact match)
            {
              sourceUrl: eventData.sourceUrl,
              source: { $in: ['serpapi', 'serper'] } // Check both sources
            }
          ]
        });

        if (!existingEvent) {
          // Don't save to database yet - return event data for AI validation
          // AI batch validation in chatController will filter out non-events
          events.push(eventData);
          logger.info(`Event candidate found (will validate before saving): ${eventData.title}`);
        } else {
          logger.info(`Skipping duplicate event: ${eventData.title}`);
          continue;
        }
      } catch (error) {
        logger.warn('Error processing event result:', error);
        continue;
      }
    }

    return events;
  } catch (error) {
    logger.error('Error in searchEvents:', error.response?.data || error.message);
    return [];
  }
};

// Search for event details by event name - comprehensive web search
export const searchEventDetails = async (eventName) => {
  try {
    // Multiple search queries to get comprehensive information
    const searchQueries = [
      `${eventName} event date time location`,
      `${eventName} festival celebration`,
      `${eventName} 2024 2025 2026`,
    ];

    let allResults = [];

    // Search with multiple queries - use SerpAPI primary, Serper fallback
    for (const searchQuery of searchQueries) {
      try {
        // Try SerpAPI first
        try {
          const serpApiResponse = await axios.get('https://serpapi.com/search', {
            params: {
              q: searchQuery,
              api_key: config.serpApiKey,
              engine: 'google',
              num: 10,
            },
            timeout: 20000,
          });

          const serpResults = serpApiResponse.data?.organic_results || [];
          const formattedResults = serpResults.map(result => ({
            title: result.title || '',
            snippet: result.snippet || '',
            link: result.link || result.url || '',
          }));
          allResults = [...allResults, ...formattedResults];
          logger.info(`[SERPAPI] Found ${formattedResults.length} results for "${searchQuery}"`);
        } catch (serpApiError) {
          // Fallback to Serper
          logger.warn(`[SERPAPI] Failed for "${searchQuery}", trying Serper fallback: ${serpApiError.message}`);
          if (config.serperApiKey) {
            const serperResponse = await axios.post(
              'https://google.serper.dev/search',
              {
                q: searchQuery,
                num: 10,
              },
              {
                headers: {
                  'X-API-KEY': config.serperApiKey,
                  'Content-Type': 'application/json',
                },
                timeout: 20000,
              }
            );

            const serperResults = serperResponse.data?.organic || [];
            allResults = [...allResults, ...serperResults];
            logger.info(`[SERPER] Found ${serperResults.length} results for "${searchQuery}" (fallback)`);
          }
        }
      } catch (error) {
        logger.warn(`Error in search query "${searchQuery}":`, error.message);
        continue;
      }
    }

    // Remove duplicates by URL
    const uniqueResults = [];
    const seenUrls = new Set();
    for (const result of allResults) {
      if (result.link && !seenUrls.has(result.link)) {
        seenUrls.add(result.link);
        uniqueResults.push(result);
      }
    }

    // Extract event details from all search results - NO REGEX, only return raw snippets for AI extraction
    const eventDetails = {
      found: false,
      title: eventName,
      date: null,
      time: null,
      location: null,
      description: null,
      sourceUrl: null,
      allSnippets: [],
      allUrls: [],
      rawSnippets: [], // Store raw snippets with titles for AI extraction
    };

    if (uniqueResults.length > 0) {
      eventDetails.found = true;
      const firstResult = uniqueResults[0];
      eventDetails.sourceUrl = firstResult.link || null;
      eventDetails.description = firstResult.snippet || null;

      // Collect all snippets for AI extraction (NO REGEX)
      eventDetails.allSnippets = uniqueResults.slice(0, 10).map(r => r.snippet || '').filter(s => s);
      eventDetails.rawSnippets = uniqueResults.slice(0, 10).map(r => ({
        snippet: r.snippet || '',
        title: r.title || '',
        link: r.link || ''
      })).filter(r => r.snippet || r.title);
      eventDetails.allUrls = uniqueResults.slice(0, 10).map(r => r.link || '').filter(u => u);
    }

    return eventDetails;
  } catch (error) {
    logger.error('Error searching event details:', error.response?.data || error.message);
    return {
      found: false,
      title: eventName,
      date: null,
      time: null,
      location: null,
      description: null,
      sourceUrl: null,
      allSnippets: [],
      allUrls: [],
      rawSnippets: [], // Include rawSnippets in error return too
    };
  }
};
