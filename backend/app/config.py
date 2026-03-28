from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://localhost:5432/threatlens"
    test_database_url: str = "sqlite+aiosqlite:///./test.db"
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    # JWT secret from Supabase dashboard → Settings → API → JWT Secret
    supabase_jwt_secret: str = ""

    # CORS — comma-separated list of allowed origins
    allowed_origins: str = "http://localhost:3000"

    # Feed API keys (empty string = feed disabled; worker skips if not configured)
    otx_api_key: str = ""
    # abuse.ch URLhaus now requires authentication (API key from https://abuse.ch/)
    urlhaus_api_key: str = ""
    # VirusTotal Free API (https://www.virustotal.com/)
    vt_api_key: str = ""

    # Feed schedule intervals (minutes)
    # URLhaus: no auth, no documented rate limit → hourly polling is safe
    urlhaus_schedule_minutes: int = 60
    # OTX: generous free tier → 2-hour polling with delta queries
    otx_schedule_minutes: int = 120

    # OTX: max pulses to fetch per page (pagination stops at "next": null)
    otx_pulse_limit: int = 20

    # OTX: max pages to fetch on the very first run (no prior sync timestamp).
    # Subsequent delta runs are uncapped — they only pull recently-modified pulses.
    otx_max_pages_first_run: int = 1

    # ThreatFox: same abuse.ch Auth-Key as URLhaus; 6-hour polling interval
    threatfox_schedule_minutes: int = 360

    # MITRE ATT&CK: public STIX bundle, no API key — daily refresh
    mitre_attack_schedule_minutes: int = 1440

    # CISA KEV: public JSON feed, no API key — daily refresh
    cisa_kev_schedule_minutes: int = 1440

    # VirusTotal Free: 4 req/min rate limit → 15s sleep per call — every 6h pass
    vt_schedule_minutes: int = 360

    # Feodo Tracker: public JSON feed, no API key — hourly refresh
    feodotracker_schedule_minutes: int = 60

    # MalwareBazaar: public API, no API key — hourly refresh
    malwarebazaar_schedule_minutes: int = 60

    # SSLBL: public JSON feed, no API key — every 2h refresh
    sslbl_schedule_minutes: int = 120

    # GeoIP Enricher: ip-api.com batch geocoding, no API key — every 2h
    geoip_enricher_schedule_minutes: int = 120

    # Correlation Engine: cluster IOCs into campaigns — every 6h
    # Uses a 5-minute startup delay so feeds have time to ingest first
    correlation_schedule_minutes: int = 360

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
