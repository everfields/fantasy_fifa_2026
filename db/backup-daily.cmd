@echo off
rem Daily backup wrapper for Windows Task Scheduler ("ResiporraDailyBackup").
rem Runs db/backup-rest.sh under Git Bash and appends output to a log.
"C:\Program Files\Git\bin\bash.exe" -lc "cd /c/dev/fantasy_fifa_2026 && bash db/backup-rest.sh >> db/backups/backup.log 2>&1"
