$root = Split-Path -Parent $PSScriptRoot
& "$root\pgsql\bin\pg_ctl.exe" -D "$root\pgdata" stop
