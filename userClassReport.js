const fs = require('fs');
const path = require('path');
const fastcsv = require('fast-csv');
const VistaClient = require('./vistaClient');
const config = require('./config');
const { getAllDuzAccounts } = require('./duzAccounts');

/**
 * User Class Report Generator
 * Main logic for generating user class reports
 */
class UserClassReport {
    constructor(stationFilter = null) {
        this.vistaClient = new VistaClient();
        this.stationFilter = stationFilter; // Array of station numbers to process, or null for all
        this.results = [];
        this.stats = {
            stationsTotal: 0,
            stationsProcessed: 0,
            stationsSkipped: 0,
            stationsFailed: 0,
            usersFound: 0,
            startTime: null,
            endTime: null
        };
    }

    /**
     * Generate the user class report
     */
    async generate() {
        this.stats.startTime = new Date();
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('AVS ADMIN USER CLASS REPORT GENERATOR');
        console.log('═══════════════════════════════════════════════════════\n');

        try {
            // Step 1: Get all accounts from CSV
            let allAccounts = getAllDuzAccounts();
            
            // Filter by station if specified
            if (this.stationFilter && this.stationFilter.length > 0) {
                allAccounts = allAccounts.filter(acc => 
                    this.stationFilter.includes(acc.stationNo)
                );
                
                if (allAccounts.length === 0) {
                    console.log(`[WARN] No accounts found for station(s): ${this.stationFilter.join(', ')}`);
                    console.log('[WARN] Check accounts.csv for valid station numbers\n');
                    return;
                }
            }
            
            console.log(`\n[INFO] Found ${allAccounts.length} station account(s) to process\n`);

            this.stats.stationsTotal = allAccounts.length;

            // Step 2: Process each station sequentially
            let stationIndex = 0;
            for (const account of allAccounts) {
                stationIndex++;
                const sta3n = account.stationNo;
                
                console.log(`[${stationIndex}/${allAccounts.length}] Station ${sta3n}...`);
                
                try {
                    // Get user class IENs for this station
                    const searchPattern = config.report.searchPattern || "AVS";
                    const userClasses = await this.vistaClient.getUserClassIENs(sta3n, searchPattern);
                    
                    if (userClasses.length > 0) {
                        await this.processStation(sta3n, userClasses);
                        this.stats.stationsProcessed++;
                    } else {
                        console.log(`   [SKIP] No user classes matching "${searchPattern}" found - SKIPPED\n`);
                        this.stats.stationsSkipped++;
                    }
                } catch (error) {
                    console.error(`   [ERROR] Processing failed - ${error.message}\n`);
                    this.stats.stationsFailed++;
                }
            }

            // Step 3: Export results
            await this.exportResults();

            // Step 4: Print summary
            this.stats.endTime = new Date();
            this.printSummary();

        } catch (error) {
            console.error('\n[ERROR] Report generation failed:', error);
            throw error;
        }
    }

    /**
     * Process a single station
     */
    async processStation(sta3n, classes) {
        for (const classInfo of classes) {
            console.log(`   [INFO] ${classInfo.userClassName} (IEN ${classInfo.userClassIEN})`);
            
            const users = await this.vistaClient.getUsersByClass(sta3n, classInfo.userClassIEN);

            // Add to results
            for (const user of users) {
                this.results.push({
                    stationNo: sta3n,
                    userClassIEN: classInfo.userClassIEN,
                    userClassName: classInfo.userClassName,
                    userDuz: user.ien,
                    userName: user.name
                });
                this.stats.usersFound++;
            }
            
            console.log(`      [OK] ${users.length} active user(s) added\n`);
        }
    }

    /**
     * Export results to CSV
     */
    async exportResults() {
        // Ensure output directory exists
        const outputDir = config.report.outputDir;
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate filename with timestamp (including time for history)
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
        const filename = `userclass_report_${timestamp}.csv`;
        const filepath = path.join(outputDir, filename);

        return new Promise((resolve, reject) => {
            const ws = fs.createWriteStream(filepath);
            
            const csvStream = fastcsv.format({ headers: true });
            csvStream.pipe(ws);

            // Write data
            for (const record of this.results) {
                csvStream.write({
                    'Station': record.stationNo,
                    'User Class IEN': record.userClassIEN,
                    'User Class Name': record.userClassName,
                    'DUZ': record.userDuz,
                    'User Name': record.userName
                });
            }

            csvStream.end();

            ws.on('finish', () => {
                console.log(`\n[OK] Report exported to: ${filepath}`);
                resolve(filepath);
            });

            ws.on('error', reject);
        });
    }

    /**
     * Print summary statistics
     */
    printSummary() {
        const duration = Math.round((this.stats.endTime - this.stats.startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('REPORT SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Total Stations:       ${this.stats.stationsTotal}`);
        console.log(`Stations Processed:   ${this.stats.stationsProcessed}`);
        console.log(`Stations Skipped:     ${this.stats.stationsSkipped}`);
        console.log(`Stations Failed:      ${this.stats.stationsFailed}`);
        console.log(`Total Users Found:    ${this.stats.usersFound}`);
        console.log(`Execution Time:       ${minutes}m ${seconds}s`);
        console.log('═══════════════════════════════════════════════════════\n');
    }
}

module.exports = UserClassReport;
