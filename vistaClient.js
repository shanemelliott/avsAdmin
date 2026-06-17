const axios = require('axios');
const config = require('./config');
const { getDuzAccountForStation } = require('./duzAccounts');

/**
 * VistA Client - RPC Client for querying VistA stations
 * Based on failureAnalysis/vistaClient.js pattern
 */
class VistaClient {
    constructor() {
        this.baseUrl = config.vista.baseUrl;
        this.timeout = config.vista.timeout;

        // Configure HTTPS agent for VA certificates
        const https = require('https');
        const httpsAgentOptions = {
            secureProtocol: 'TLSv1_2_method',
            ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
            rejectUnauthorized: false // Accept self-signed certs
        };

        this.axios = axios.create({
            timeout: this.timeout,
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: new https.Agent(httpsAgentOptions)
        });
    }

    /**
     * Get JWT authentication token
     */
    async getAuthToken() {
        // Always get a fresh token - no caching
        // Report generation takes longer than token expiry
        try {
            const response = await this.axios.post(`${this.baseUrl}/auth/token`, {
                "key": config.vista.apiKey
            });

            if (response.data?.data?.token) {
                return response.data.data.token;
            } else {
                throw new Error('Invalid token response format');
            }
        } catch (error) {
            console.error('[ERROR] Failed to get VistA authentication token:', error.message);
            throw error;
        }
    }

    /**
     * Get DUZ account for a specific station
     */
    getDuzForStation(stationNo) {
        const account = getDuzAccountForStation(stationNo);
        if (account) {
            return account.accountDuz.toString();
        }
        return null;
    }

    /**
     * Get users by user class IEN
     * @param {string} stationNo - Station number (e.g., "605")
     * @param {string} userClassIEN - User class IEN to filter by
     * @returns {Promise<Array>} Array of {ien, name, stationNo}
     */
    async getUsersByClass(stationNo, userClassIEN) {
        const duz = this.getDuzForStation(stationNo);
        
        if (!duz) {
            return [];
        }
        
        try {

            // Get auth token
            const token = await this.getAuthToken();

            // Build RPC request
            // Query File 8930.3 (User Class Membership) with SCREEN to filter by User Class
            // Fields: @=IEN, .01=Person (pointer to File 200), 1=User Class
            const rpcRequest = {
                "context": "DVBA CAPRI GUI",
                "rpc": "DDR LISTER",
                "jsonResult": false,
                "parameters": [{
                    "namedArray": {
                        "FILE": "8930.3",
                        "FIELDS": "@;.01",
                        "FLAGS": "IP",
                        "XREF": "#",
                        "MAX": "10000",
                        "SCREEN": `I $P(^USR(8930.3,Y,0),U,2)=${userClassIEN}`
                    }
                }]
            };

            // Make RPC call
            const url = `${this.baseUrl}/vista-sites/${stationNo}/users/${duz}/rpc/invoke`;
            
            // Only log details for debugging if needed
            // console.log(`\n[DEBUG] Station ${stationNo} - RPC Call Details:`);

            const response = await this.axios.post(url, rpcRequest, {
                headers: { 'authorization': `Bearer ${token}` }
            });

            // Log raw response for debugging (only if small)
            // console.log(`\n[DEBUG] Station ${stationNo} - Raw RPC Response:`);
            // console.log('   Payload:', response.data.payload || '(empty)');

            // Parse response to get DUZs
            const userDuzs = this.parseRPCResponse(response.data.payload, stationNo);
            
            if (userDuzs.length === 0) {
                console.log(`      No members found in class ${userClassIEN}`);
                return [];
            }
            
            console.log(`      Found ${userDuzs.length} member(s), fetching details...`);

            // Get details for each user (with progress for large sets)
            const users = [];
            let fetchCount = 0;
            for (const userInfo of userDuzs) {
                fetchCount++;
                if (userDuzs.length > 20 && fetchCount % 10 === 0) {
                    console.log(`      Progress: ${fetchCount}/${userDuzs.length} processed...`);
                }
                
                const userDetails = await this.getUserInfoByDuz(stationNo, userInfo.ien);
                if (userDetails) {
                    users.push({
                        ...userDetails,
                        stationNo: stationNo
                    });
                }
                // If userDetails is null (inactive user), skip them - don't add to results
            }

            return users;

        } catch (error) {
            console.log(`      [ERROR] Failed to query class members: ${error.message}`);
            return [];
        }
    }

    /**
     * Parse RPC response payload
     * Response format from File 8930.3: IEN^PersonIEN^PersonName
     * @param {string} payload - Raw RPC response (line-delimited)
     * @param {string} stationNo - Station number for context
     * @returns {Array} Parsed user records
     */
    parseRPCResponse(payload, stationNo) {
        if (!payload) {
            console.log(`   [WARN] No payload received`);
            return [];
        }

        const users = [];
        const lines = payload.split(/\r?\n/).filter(line => line.trim());

        // Only log detailed parsing for small result sets
        if (lines.length <= 10) {
            console.log(`   [DEBUG] Parsing ${lines.length} line(s)...`);
        }

        for (const line of lines) {
            if (lines.length <= 10) {
                console.log(`   Line: "${line}"`);
            }
            const parts = line.split('^');
            
            if (parts.length >= 2) {
                const user = {
                    ien: parts[1],  // DUZ (field .01 from File 8930.3)
                    name: parts[2] || parts[1],  // Person name if available
                    stationNo: stationNo
                };
                if (lines.length <= 10) {
                    console.log(`   [OK] Parsed user:`, user);
                }
                users.push(user);
            } else if (lines.length <= 10) {
                console.log(`   [WARN] Skipping line - insufficient parts`);
            }
        }

        return users;
    }

    /**
     * Get user class IENs by searching for a pattern
     * @param {string} stationNo - Station number
     * @param {string} searchPattern - Pattern to search (e.g., "AVS")
     * @returns {Promise<Array>} Array of {userClassIEN, userClassName}
     */
    async getUserClassIENs(stationNo, searchPattern = "AVS") {
        const accountDuz = this.getDuzForStation(stationNo);
        
        if (!accountDuz) {
            return [];
        }
        
        try {

            const token = await this.getAuthToken();

            const rpcRequest = {
                "context": "OR CPRS GUI CHART",
                "rpc": "TIU USER CLASS LONG LIST",
                "jsonResult": false,
                "parameters": [
                    { "string": searchPattern },
                    { "string": "1" }
                ]
            };

            const url = `${this.baseUrl}/vista-sites/${stationNo}/users/${accountDuz}/rpc/invoke`;
            const response = await this.axios.post(url, rpcRequest, {
                headers: { 'authorization': `Bearer ${token}` }
            });

            // Parse response: IEN^UserClassName
            const payload = response.data.payload;
            if (!payload) {
                console.log(`   [WARN] No user classes found for pattern "${searchPattern}"`);
                return [];
            }

            const userClasses = [];
            const lines = payload.split(/\r?\n/).filter(line => line.trim());

            // Show first few lines for debugging
            if (lines.length <= 5) {
                console.log(`   [DEBUG] RPC returned ${lines.length} line(s):`);
                lines.forEach(line => console.log(`      ${line}`));
            } else {
                console.log(`   [DEBUG] RPC returned ${lines.length} line(s) (showing first 3):`);
                lines.slice(0, 3).forEach(line => console.log(`      ${line}`));
                console.log(`      ... (${lines.length - 3} more)`);
            }

            for (const line of lines) {
                const parts = line.split('^');
                if (parts.length >= 2) {
                    const userClassName = parts[1];
                    const userClassIEN = parts[0];
                    
                    // Only include classes that actually contain the search pattern
                    if (userClassName.toUpperCase().includes(searchPattern.toUpperCase())) {
                        userClasses.push({
                            userClassIEN: userClassIEN,
                            userClassName: userClassName
                        });
                    }
                }
            }

            if (userClasses.length > 0) {
                console.log(`   [OK] Found ${userClasses.length} matching class(es):`);
                userClasses.forEach(uc => {
                    console.log(`      - IEN ${uc.userClassIEN}: ${uc.userClassName}`);
                });
            }
            
            return userClasses;

        } catch (error) {
            console.log(`   [ERROR] Failed to query user classes: ${error.message}`);
            return [];
        }
    }

    /**
     * Get user information by DUZ
     * @param {string} stationNo - Station number
     * @param {string} userDuz - User DUZ to look up
     * @returns {Promise<Object>} User details {ien, name}
     */
    async getUserInfoByDuz(stationNo, userDuz) {
        const accountDuz = this.getDuzForStation(stationNo);
        
        try {
            if (!accountDuz) {
                return null;
            }

            const token = await this.getAuthToken();

            const rpcRequest = {
                "context": "SDECRPC",
                "rpc": "SDES GET USER PROFILE BY DUZ",
                "jsonResult": true,
                "parameters": [
                    { "string": userDuz.toString() }
                ]
            };

            const url = `${this.baseUrl}/vista-sites/${stationNo}/users/${accountDuz}/rpc/invoke`;
            const response = await this.axios.post(url, rpcRequest, {
                headers: { 'authorization': `Bearer ${token}` }
            });

            // Check for error indicating inactive user
            const payload = response.data.payload;
            if (payload?.Error && Array.isArray(payload.Error)) {
                const errorMsg = payload.Error.join(' ');
                if (errorMsg.includes('User must be active user')) {
                    // User is DISUSER'd/inactive - skip them
                    return null;
                }
            }

            const userData = payload?.User;
            if (userData) {
                return {
                    ien: userData.IEN?.toString() || userDuz,
                    name: userData.Name || ''
                };
            }
        } catch (error) {
            // Silently skip - could be inactive user or other issue
            // Error message already logged if it's a 400 (inactive user)
            return null;
        }
    }

    /**
     * Test VistA connection and authentication
     */
    async testConnection() {
        try {
            const token = await this.getAuthToken();
            console.log('[OK] VistA authentication successful');
            return true;
        } catch (error) {
            console.error('[ERROR] VistA authentication failed');
            return false;
        }
    }
}

module.exports = VistaClient;
