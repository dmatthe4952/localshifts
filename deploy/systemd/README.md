# Systemd (staging)

This is an optional way to ensure the VolunteerFlow Docker Compose stack starts on boot.

## Install

1. Copy the unit file:
   - `sudo cp deploy/systemd/volunteerflow.service /etc/systemd/system/volunteerflow.service`
2. Edit `/etc/systemd/system/volunteerflow.service` and set:
   - `WorkingDirectory=` to the folder containing `docker-compose.staging.yml` and `.env.staging`
3. Enable + start:
   - `sudo systemctl daemon-reload`
   - `sudo systemctl enable --now volunteerflow`

## Operate

- Status: `sudo systemctl status volunteerflow`
- Logs: `sudo journalctl -u volunteerflow -f`
- Restart: `sudo systemctl restart volunteerflow`

