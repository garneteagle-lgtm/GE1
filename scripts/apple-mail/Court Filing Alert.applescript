-- Court Filing Alert — Apple Mail rule script for Case Manager.
--
-- Install:
--   1. Copy this file to ~/Library/Application Scripts/com.apple.mail/
--   2. Paste your FILING_INGEST_TOKEN (from .env) into ingestToken below.
--   3. Mail → Settings → Rules → Add Rule. Conditions: "From contains uscourts.gov"
--      (plus any state e-filing senders). Actions: "Run AppleScript" → this script.
--
-- For each matching message it pops a macOS notification immediately, then hands
-- the notice to Case Manager, which files it under the right case and adds a
-- "Review filing" task. If Case Manager isn't running, you still get the alert.

property ingestURL : "http://127.0.0.1:3000/api/filings/ingest"
property ingestToken : "PASTE_FILING_INGEST_TOKEN_HERE"

using terms from application "Mail"
	on perform mail action with messages theMessages for rule theRule
		repeat with m in theMessages
			try
				my handleMessage(m)
			on error errMsg
				display notification errMsg with title "Court filing alert failed"
			end try
		end repeat
	end perform mail action with messages
end using terms from

on handleMessage(m)
	tell application "Mail"
		set theSubject to subject of m
		set theSender to sender of m
		set theId to message id of m
		set theDate to date received of m
		set theBody to content of m
	end tell

	-- Convert the received date to epoch seconds without depending on locale.
	set nowEpoch to (do shell script "date +%s") as number
	set receivedEpoch to (nowEpoch + (theDate - (current date))) as integer

	-- The body goes through a temp file so it never appears on a command line.
	set tmpPath to do shell script "mktemp -t casemgr-filing"
	try
		set fh to open for access (POSIX file tmpPath) with write permission
		set eof fh to 0
		write theBody to fh as «class utf8»
		close access fh
	on error errMsg
		try
			close access (POSIX file tmpPath)
		end try
		do shell script "rm -f " & quoted form of tmpPath
		error errMsg
	end try

	set cmd to "curl -sS -f --max-time 10" & ¬
		" -H " & quoted form of ("Authorization: Bearer " & ingestToken) & ¬
		" --data-urlencode " & quoted form of ("messageId=" & theId) & ¬
		" --data-urlencode " & quoted form of ("from=" & theSender) & ¬
		" --data-urlencode " & quoted form of ("subject=" & theSubject) & ¬
		" --data-urlencode " & quoted form of ("receivedAt=" & receivedEpoch) & ¬
		" --data-urlencode " & quoted form of ("body@" & tmpPath) & ¬
		" " & quoted form of ingestURL

	try
		set summaryLine to do shell script cmd
		set subtitleLine to "Saved to Case Manager"
	on error
		set summaryLine to theSubject
		set subtitleLine to "Not saved — is Case Manager running?"
	end try
	do shell script "rm -f " & quoted form of tmpPath

	display notification summaryLine with title "⚖️ New court filing" subtitle subtitleLine sound name "Glass"
end handleMessage
