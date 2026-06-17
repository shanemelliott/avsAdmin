# AVS Admin User Class Report Generator

Generate comprehensive reports of VistA users assigned to AVS-related user classes across all VA medical centers.

## Overview

This application queries each VistA station directly via the VistA API-X to:
1. Find all user classes matching a search pattern (default: "AVS")
2. Query File 8930.3 (User Class Membership) for all users in each class
3. Fetch user details via RPC calls
4. Export results to timestamped CSV files

### Default User Classes Queried
- **AVS ADMINISTRATOR**
- **AVS BATCH PRINT**
- **PVS MANAGER** (if exists at station)

Any user class containing "AVS" in the name will be included.

## Prerequisites

- **Node.js** 18 or higher
- **pnpm** package manager
- **VistA API-X Access**: API key for production or staging environment
- **Network Access**: VPN connection to VA network

## Installation

1. **Clone or navigate to the project directory**:
   ```powershell
   cd c:\Users\VACOEllioS1\apps\avsAdmin
   ```

2. **Install dependencies**:
   ```powershell
   pnpm install
   ```

3. **Create .env configuration file**:
   ```powershell
   Copy-Item .env.template .env
   ```

4. **Edit .env with your credentials**:
   Open `.env` in your editor and update:
   - `VISTA_API_KEY` - Your VistA API-X key
   - `ACCOUNTS_FILE` - accounts.csv (production) or accountsStage.csv (staging)

## Configuration

### Environment Variables (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VISTA_BASE_URL` | VistA API-X endpoint | https://cds.med.va.gov/vista-api-x |
| `VISTA_API_KEY` | API key | *required* |
| `VISTA_CONTEXT` | RPC context | OR CPRS GUI CHART |
| `OUTPUT_DIR` | Report output directory | ./results |
| `ACCOUNTS_FILE` | DUZ accounts CSV file | accounts.csv |
| `SEARCH_PATTERN` | User class search pattern | AVS |

### Testing Against Staging

To test against staging VistA systems:

1. **Create .env.staging**:
   ```env
   VISTA_BASE_URL=https://staging.cds.med.va.gov/vista-api-x
   VISTA_API_KEY=your_staging_api_key
   ACCOUNTS_FILE=accountsStage.csv
   SEARCH_PATTERN=AVS
   ```

2. **Use staging config**:
   ```powershell
   Copy-Item .env.staging .env
   ```

3. **Run the report**:
   ```powershell
   pnpm start
   ```

### DUZ Accounts

Two account files are provided:

- **accounts.csv** - Production VistA stations (~145 stations)
- **accountsStage.csv** - Staging VistA stations (single test station)

The accounts file maps station numbers to DUZ accounts for RPC authentication.

Format: `stationNo,accountDuz`

Example:
```
605,12345
664,67890
500,11111
```

## Usage

### Generate Full Report

Run the complete report across all stations:

```powershell
pnpm start
```

**Expected Runtime**: 
- Production (130 stations): ~30-45 minutes
- Staging (1 station): ~1 minute

### Run Report for Single Station

Process only a specific station for testing or troubleshooting:

```powershell
node index.js 605
```

Or with pnpm:
```powershell
pnpm start 605
```

### Run Report for Multiple Stations

Process multiple specific stations (comma-separated):

```powershell
node index.js 605,664,691
```

**Expected Runtime**: ~30 seconds to 2 minutes per station

### Save Output to Log File

Capture detailed output for troubleshooting:

```powershell
pnpm start > report.log 2>&1
```

Then search the log:
```powershell
Select-String -Pattern "554" report.log -Context 3
```

### Test Individual Components

**Test VistA Authentication**:
```powershell
pnpm run test:vista
```

**Test DUZ Account Lookup**:
```powershell
pnpm run test:duz
```

## Output

### CSV Report

Reports are saved to `results/userclass_report_YYYY-MM-DD_HH-MM-SS.csv` with timestamps to maintain history.

**Columns**:

| Column | Description | Example |
|--------|-------------|---------|
| Station | Station number | 605 |
| User Class IEN | Internal entry number | 667 |
| User Class Name | Class name | AVS ADMINISTRATOR |
| User IEN | User IEN in File 200 | 81821 |
| User Name | User's name | SMITH,JOHN |
| DISUSER | Not populated via RPC | |
| Termination Date | Not populated via RPC | |

### Sample Output

```csv
Station,User Class IEN,User Class Name,User IEN,User Name,DISUSER,Termination Date
605,667,AVS ADMINISTRATOR,12345,SMITH JOHN,,
605,667,AVS ADMINISTRATOR,23456,DOE JANE,,
664,870,AVS ADMINISTRATOR,34567,BROWN SAM,,
```

### Console Output

During execution:

```
[1/130] Station 605...
   📝 RPC returned 44 lines (showing first 3):
      667^AVS ADMINISTRATOR
      643^C&P AUTHORIZE
      633^CANCER STAGING
      ... (41 more)
   ✅ Found 1 matching class(es):
      - IEN 667: AVS ADMINISTRATOR
   📋 AVS ADMINISTRATOR (IEN 667)
      Found 22 member(s), fetching details...
      ✅ 16 active user(s) added

[2/130] Station 664...
   ⏭️  No user classes matching "AVS" found - SKIPPED
```

### Summary Statistics

After completion:

```
═══════════════════════════════════════════════════════
📈 REPORT SUMMARY
═══════════════════════════════════════════════════════
Total Stations:       130
Stations Processed:   41
Stations Skipped:     89
Stations Failed:      0
Total Users Found:    310
Execution Time:       32m 15s
═══════════════════════════════════════════════════════
```

## How It Works

### VistA RPCs Used

1. **TIU USER CLASS LONG LIST** - Get user classes matching search pattern
   - Context: OR CPRS GUI CHART
   - Returns: IEN^UserClassName format
   - Note: Uses $ORDER, returns all classes alphabetically starting from pattern
   - Code filters to only classes containing the search pattern

2. **DDR LISTER** - Query File 8930.3 for class members
   - Context: OR CPRS GUI CHART
   - SCREEN: `I $P(^USR(8930.3,Y,0),U,2)=${userClassIEN}`
   - Returns: MembershipIEN^PersonIEN format

3. **SDES GET USER PROFILE BY DUZ** - Get user details
   - Context: SDECRPC
   - Returns: JSON with user name and IEN
   - Filters out inactive users (returns error for DISUSER'd accounts)

### Token Management

The application gets a **fresh authentication token for each RPC call** to prevent token expiration during long-running reports.

### Inactive User Filtering

Users who are DISUSER'd (disabled) are automatically excluded:
- The `SDES GET USER PROFILE BY DUZ` RPC returns an error for inactive users
- These users are silently skipped and not included in the report
- Only active users appear in the final CSV

## Project Structure

```
avsAdmin/
├── .env                    # Configuration (gitignored)
├── .env.template           # Configuration template
├── .env.staging            # Staging configuration example
├── .gitignore              # Git ignore patterns
├── package.json            # Dependencies and scripts
├── README.md               # This file
├── accounts.csv            # Production station/DUZ mappings
├── accountsStage.csv       # Staging station/DUZ mappings
├── config.js               # Configuration loader
├── index.js                # Main entry point
├── vistaClient.js          # VistA RPC client
├── duzAccounts.js          # DUZ account lookup
├── userClassReport.js      # Report orchestration
├── rpc/                    # RPC reference payloads
│   ├── getUserClassIEn.json
│   ├── getUserClassNamesFromXRef.json
│   └── getUserInfoByDuz.json
└── results/                # Generated CSV reports (gitignored)
    └── userclass_report_YYYY-MM-DD_HH-MM-SS.csv
```

## Key Files

### Core Application

- **index.js** - Entry point, launches report generation
- **userClassReport.js** - Main report logic, orchestrates the workflow
- **vistaClient.js** - VistA RPC client, handles all API calls
- **duzAccounts.js** - Loads and manages station-to-DUZ mappings
- **config.js** - Loads and validates environment configuration

### Configuration

- **.env** - Runtime configuration (not in git)
- **.env.template** - Template showing all available options
- **.env.staging** - Example staging configuration
- **accounts.csv** - Production stations (~130 stations)
- **accountsStage.csv** - Staging stations (typically 1 test station)

### Reference

- **rpc/*.json** - Example RPC request/response payloads for documentation

## Troubleshooting

### No users found for a station

**Cause**: Station may not have any user classes containing "AVS"

**Solution**: Check if the station has AVS user classes defined in File 8930.1

### 400 errors for specific stations

**Cause**: Token expiration (fixed in current version) or invalid DUZ account

**Solution**: 
- Verify the DUZ account in accounts.csv is valid for that station
- Check the log file for specific error messages

### Report runs slow

**Cause**: Getting fresh tokens for each RPC call (by design)

**Solution**: This is expected. Processing 130 stations takes 30-45 minutes. Use staging for testing.

### Station shows "SKIPPED"

**Causes**:
1. No user classes found matching search pattern
2. RPC call failed (check logs)
3. No DUZ account in accounts.csv

**Solution**: Review the log file for that specific station number

### Testing/Debugging a Specific Station

To test or debug issues with a specific station without running the full report:

```powershell
node index.js 605 > station_605.log 2>&1
```

This processes only station 605 and saves output to a dedicated log file.

## Customization

### Change Search Pattern

To search for different user classes, modify `.env`:

```env
SEARCH_PATTERN=NURSE
```

This will find all user classes containing "NURSE" in the name.

### Add More Stations

Edit `accounts.csv` and add a new line:

```
999,12345678
```

Format: `stationNumber,accountDuz`

### Modify VistA Timeout

If experiencing timeout errors, increase the timeout in `.env`:

```env
VISTA_TIMEOUT=120000
```

(Value in milliseconds, default is 60000 = 60 seconds)

## License

Internal VA use only.

## Support

For issues or questions, contact the development team.
├── vistaClient.js          # VistA RPC client
├── duzAccounts.js          # DUZ account lookup
├── userClassReport.js      # Report generator
├── queries/
│   └── getClassIENs.sql   # CDW query for user classes
├── rpc/
│   └── getUserClassNamesFromXRef.json  # RPC definition
├── results/                # Generated reports (gitignored)
└── results/                # Generated CSV reports (gitignored)
    └── userclass_report_YYYY-MM-DD_HH-MM-SS.csv
```

## Key Files

### Core Application

- **index.js** - Entry point, launches report generation
- **userClassReport.js** - Main report logic, orchestrates the workflow
- **vistaClient.js** - VistA RPC client, handles all API calls
- **duzAccounts.js** - Loads and manages station-to-DUZ mappings
- **config.js** - Loads and validates environment configuration

### Configuration

- **.env** - Runtime configuration (not in git)
- **.env.template** - Template showing all available options
- **.env.staging** - Example staging configuration
- **accounts.csv** - Production stations (~130 stations)
- **accountsStage.csv** - Staging stations (typically 1 test station)

### Reference

- **rpc/*.json** - Example RPC request/response payloads for documentation

## License

Internal VA use only.

## Support

For issues or questions, contact the development team.
