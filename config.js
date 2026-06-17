require('dotenv').config();

/**
 * Configuration Module
 * Loads and validates environment variables
 */

const config = {
    // VistA API-X Configuration
    vista: {
        baseUrl: process.env.VISTA_BASE_URL || 'https://cds.med.va.gov/vista-api-x',
        apiKey: process.env.VISTA_API_KEY,
        timeout: parseInt(process.env.VISTA_TIMEOUT) || 60000,
        context: process.env.VISTA_CONTEXT || 'OR CPRS GUI CHART'
    },

    // Report Configuration
    report: {
        outputDir: process.env.OUTPUT_DIR || './results',
        searchPattern: process.env.SEARCH_PATTERN || 'AVS',
        accountsFile: process.env.ACCOUNTS_FILE || 'accounts.csv'
    }
};

/**
 * Validate required configuration
 */
function validateConfig() {
    const required = {
        'VISTA_API_KEY': config.vista.apiKey
    };

    const missing = Object.entries(required)
        .filter(([key, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}\n` +
            'Please copy .env.template to .env and configure your credentials.');
    }
}

// Validate on load
validateConfig();

module.exports = config;
