"""Logging sanitization configuration."""

import logging
import re

class SensitiveDataFilter(logging.Filter):
    """Logging filter to redact credentials, secrets, tokens and authorization headers."""

    def filter(self, record: logging.LogRecord) -> bool:
        # 1. Sanitize the main message string if it is a string
        if isinstance(record.msg, str):
            record.msg = self.sanitize_string(record.msg)

        # 2. Sanitize any positional arguments that are strings
        if record.args:
            new_args = []
            for arg in record.args:
                if isinstance(arg, str):
                    new_args.append(self.sanitize_string(arg))
                else:
                    new_args.append(arg)
            record.args = tuple(new_args)

        return True

    def sanitize_string(self, text_val: str) -> str:
        if not text_val:
            return text_val

        # Redact Authorization Bearer tokens
        text_val = re.sub(
            r"(Authorization:\s*Bearer\s+)[a-zA-Z0-9_\-\.]+",
            r"\1[REDACTED]",
            text_val,
            flags=re.IGNORECASE
        )

        # Redact API keys, passwords, secrets, tokens in JSON-like or key-value structures
        # Matches patterns like api_key: "value", token=value, password = 'value'
        text_val = re.sub(
            r"((?:password|secret|key|token|api[-_]?key)(?:['\"]?\s*[:=]\s*['\"]?))[a-zA-Z0-9_\-\.]{8,}",
            r"\1[REDACTED]",
            text_val,
            flags=re.IGNORECASE
        )

        # Redact raw query param secrets in URLs (e.g. ?token=...)
        text_val = re.sub(
            r"((?:token|auth|key|password|api_key|nebius_api_key|gemini_api_key)=)[a-zA-Z0-9_\-\.]{8,}",
            r"\1[REDACTED]",
            text_val,
            flags=re.IGNORECASE
        )

        return text_val


def setup_logging_sanitizer() -> None:
    """Apply the SensitiveDataFilter to all root handlers and ASGI logger instances."""
    filt = SensitiveDataFilter()
    
    # Root logger
    logging.getLogger().addFilter(filt)
    for handler in logging.root.handlers:
        handler.addFilter(filt)
        
    # Standard ASGI / FastAPI / app loggers
    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error", "app", "fastapi", "sqlalchemy.engine"]:
        logger = logging.getLogger(logger_name)
        logger.addFilter(filt)
        for handler in logger.handlers:
            handler.addFilter(filt)
