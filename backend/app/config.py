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
    abuseipdb_api_key: str = ""
    otx_api_key: str = ""
    # abuse.ch URLhaus now requires authentication (API key from https://abuse.ch/)
    urlhaus_api_key: str = ""

    # Feed schedule intervals (minutes)
    # AbuseIPDB free tier: 1000 API calls/day → one bulk call every 6h = 4 calls/day
    abuseipdb_schedule_minutes: int = 360
    # URLhaus: no auth, no documented rate limit → hourly polling is safe
    urlhaus_schedule_minutes: int = 60
    # OTX: generous free tier → 2-hour polling with delta queries
    otx_schedule_minutes: int = 120

    # AbuseIPDB: days of history to request per run (free tier max: 30)
    abuseipdb_days_back: int = 1

    # OTX: max pulses to fetch per page (pagination stops at "next": null)
    otx_pulse_limit: int = 20

    # OTX: max pages to fetch on the very first run (no prior sync timestamp).
    # Subsequent delta runs are uncapped — they only pull recently-modified pulses.
    otx_max_pages_first_run: int = 1

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
