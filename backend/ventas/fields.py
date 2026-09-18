from django.db import models


class OracleTimestampTZField(models.DateTimeField):
    """Read legacy TIMESTAMP WITH TIME ZONE in UTC (python-oracledb Thin).

    Django sends UTC timestamps; projecting UTC avoids named-region decoding and
    preserves the instant even when a legacy row has a nonzero timezone offset.
    """
    def select_format(self, compiler, sql, params):
        if compiler.connection.vendor == 'oracle':
            return f'SYS_EXTRACT_UTC({sql})', params
        return sql, params
