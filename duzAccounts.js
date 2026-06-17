const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/sync');
const config = require('./config');

/**
 * DUZ Account Lookup
 * Loads station/DUZ mappings from configurable CSV file
 */

let accountsCache = null;

/**
 * Load accounts from CSV file
 */
function loadAccounts() {
    if (accountsCache) {
        return accountsCache;
    }

    try {
        const csvPath = path.join(__dirname, config.report.accountsFile);
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const records = parse.parse(csvContent, {
            skip_empty_lines: true,
            trim: true
        });

        accountsCache = new Map();

        // CSV format: stationNo,accountDuz
        for (const record of records) {
            if (record.length >= 2) {
                const stationNo = record[0].trim();
                const accountDuz = record[1].trim();
                
                // Use first account if multiple exist for same station
                if (!accountsCache.has(stationNo)) {
                    accountsCache.set(stationNo, {
                        stationNo,
                        accountDuz
                    });
                }
            }
        }

        console.log(`📋 Loaded ${accountsCache.size} DUZ accounts from ${config.report.accountsFile}`);
        return accountsCache;

    } catch (error) {
        console.error(`❌ Failed to load ${config.report.accountsFile}:`, error.message);
        throw error;
    }
}

/**
 * Get DUZ account for a specific station
 * @param {string} stationNo - Station number
 * @returns {Object|null} Account object {stationNo, accountDuz} or null
 */
function getDuzAccountForStation(stationNo) {
    const accounts = loadAccounts();
    return accounts.get(stationNo) || null;
}

/**
 * Get all DUZ accounts
 * @returns {Array} Array of all account objects
 */
function getAllDuzAccounts() {
    const accounts = loadAccounts();
    return Array.from(accounts.values());
}

/**
 * Check if station has a DUZ account
 * @param {string} stationNo - Station number
 * @returns {boolean}
 */
function hasStationAccount(stationNo) {
    const accounts = loadAccounts();
    return accounts.has(stationNo);
}

module.exports = {
    getDuzAccountForStation,
    getAllDuzAccounts,
    hasStationAccount
};
