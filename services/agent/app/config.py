"""Configuration for the CrashGuard AI agent service."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Bedrock
    AWS_REGION: str = "ap-south-1"
    # AWS_BEARER_TOKEN_BEDROCK is read from the environment directly by boto3.
    # ap-south-1 requires the APAC cross-region inference profile for Nova Pro;
    # the plain "amazon.nova-pro-v1:0" id is not invokable on-demand there.
    BEDROCK_MODEL_ID: str = "apac.amazon.nova-pro-v1:0"

    # Bedrock generation params
    BEDROCK_MAX_TOKENS: int = 512
    BEDROCK_TEMPERATURE: float = 0.2
    # Hard ceiling on how long we wait for Bedrock before falling back (seconds).
    # The emergency path must never block on the network.
    BEDROCK_TIMEOUT_SECONDS: float = 6.0

    # Amazon Location Service (Places API v2 / geo-places) — hospital search + reverse geocode.
    # An API key is the simplest auth; if left blank, boto3 falls back to ambient AWS creds.
    AMAZON_LOCATION_API_KEY: str = ""
    AMAZON_LOCATION_REGION: str = "ap-south-1"

    # Google Places (legacy — being replaced by Amazon Location; kept as optional fallback)
    GOOGLE_PLACES_API_KEY: str = ""

    # Twilio (outbound AI voice call to relatives — the phone can't put AI audio
    # on a cellular call, so these calls are placed from the cloud instead).
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""

    # Server
    AGENT_PORT: int = 8100


settings = Settings()
