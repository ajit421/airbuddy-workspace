# AirBuddy WorkSpace Migration Scripts

> [!WARNING]
> These scripts perform destructive or batch write/delete operations directly against your production Firestore database. Always test using the `--dry-run` flag first!

## Attendance Migration

The `migrateAttendance.cjs` script is used to migrate user attendance sub-collection records when merging multiple OAuth / secondary accounts into a single primary account.

### Setup

1. Place your project service account credential JSON file at the project root: `d:\Code\Work_flow\serviceAccountKey.json`.
   > [!CAUTION]
   > Never check `serviceAccountKey.json` into git! It has full administrative access to your Firebase project.

2. Run a dry run to verify the mappings and see how many records would be affected:
   ```bash
   node scripts/migrateAttendance.cjs --dry-run
   ```

3. If everything looks correct, run the actual migration:
   ```bash
   node scripts/migrateAttendance.cjs
   ```
