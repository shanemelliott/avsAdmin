const UserClassReport = require('./userClassReport');

/**
 * AVS Admin User Class Report Generator
 * Main entry point
 * 
 * Usage:
 *   node index.js              - Process all stations
 *   node index.js 605          - Process only station 605
 *   node index.js 605,664,691  - Process multiple stations (comma-separated)
 */

async function main() {
    try {
        // Parse command-line arguments
        const args = process.argv.slice(2);
        let stationFilter = null;
        
        if (args.length > 0) {
            // Support single station or comma-separated list
            stationFilter = args[0].split(',').map(s => s.trim());
            console.log(`[INFO] Running report for station(s): ${stationFilter.join(', ')}\n`);
        }
        
        const report = new UserClassReport(stationFilter);
        await report.generate();
        process.exit(0);
    } catch (error) {
        console.error('\n[ERROR] Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = main;
