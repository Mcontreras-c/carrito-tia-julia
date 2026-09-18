"""PostgreSQL staging configuration, without switching the active application."""
import os

os.environ['DATABASE_ENGINE'] = 'postgresql'
from .settings import *  # noqa: F403,E402

# Only needed by the one-time import; Oracle credentials remain local.
if all(os.getenv(key) for key in ('DB_NAME', 'DB_USER', 'DB_PASSWORD')):
    DATABASES['oracle'] = oracle_database()  # noqa: F405
