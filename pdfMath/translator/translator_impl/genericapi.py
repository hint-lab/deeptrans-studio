import json
import logging
import os
from typing import Any

import requests
from tenacity import before_sleep_log, retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from pdf2zh_next.config.model import SettingsModel
from pdf2zh_next.translator.base_rate_limiter import BaseRateLimiter
from pdf2zh_next.translator.base_translator import BaseTranslator

logger = logging.getLogger(__name__)


class GenericAPITranslator(BaseTranslator):
    name = "genericapi"

    def __init__(
        self,
        settings: SettingsModel,
        rate_limiter: BaseRateLimiter,
    ):
        super().__init__(settings, rate_limiter)
        cfg = settings.translate_engine_settings

        # 优先从环境变量读取固定的 API URL；若未设置则回退到配置项
        self.url_template = os.getenv("GENERIC_API_URL") or (cfg.generic_api_url or "")
        self.method = (cfg.generic_api_method or "POST").upper()
        self.headers_template = cfg.generic_api_headers or None
        self.params_template = cfg.generic_api_params or None
        self.body_template = cfg.generic_api_body or None
        self.body_type = (cfg.generic_api_body_type or "json").lower()
        self.timeout = float(cfg.generic_api_timeout) if cfg.generic_api_timeout else 60.0
        self.extract_path = cfg.generic_api_extract_json_path or None

        self.model = cfg.generic_api_model or "generic"
        self.add_cache_impact_parameters("model", self.model)
        self.add_cache_impact_parameters("endpoint", self.url_template)
        self.add_cache_impact_parameters("method", self.method)
        if self.extract_path:
            self.add_cache_impact_parameters("extract_path", self.extract_path)

    def _render_template(self, template: str, text: str) -> str:
        mapping = {
            "{text}": text,
            "{lang_in}": self.lang_in,
            "{lang_out}": self.lang_out,
        }
        rendered = template
        for k, v in mapping.items():
            rendered = rendered.replace(k, v)
        return rendered

    def _maybe_load_json(self, template: str, text: str) -> Any:
        rendered = self._render_template(template, text)
        try:
            return json.loads(rendered)
        except Exception:
            return rendered

    def _parse_headers(self, text: str) -> dict[str, str]:
        if not self.headers_template:
            return {"Content-Type": "application/json"}
        headers = self._maybe_load_json(self.headers_template, text)
        if isinstance(headers, str):
            try:
                headers = json.loads(headers)
            except Exception:
                # allow raw header string not in JSON form, ignore
                headers = {"Content-Type": "application/json"}
        if not isinstance(headers, dict):
            raise ValueError("generic_api_headers must be a JSON object")
        # stringify values
        return {str(k): str(v) for k, v in headers.items()}

    def _parse_params(self, text: str) -> dict[str, str]:
        if not self.params_template:
            return {}
        params = self._maybe_load_json(self.params_template, text)
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except Exception:
                params = {}
        if not isinstance(params, dict):
            raise ValueError("generic_api_params must be a JSON object")
        return {str(k): str(v) for k, v in params.items()}

    def _build_body(self, text: str, headers: dict[str, str]):
        if self.method in {"GET"}:
            return None, None
        if not self.body_template:
            return None, None
        if self.body_type == "json":
            data = self._maybe_load_json(self.body_template, text)
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except Exception:
                    # if body_type is json but body is not valid json after render
                    raise ValueError("generic_api_body is not valid JSON when body_type=json")
            return None, data
        if self.body_type == "form":
            data = self._maybe_load_json(self.body_template, text)
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except Exception:
                    # try key=value&key2=value2 as raw string
                    return data, None
            if not isinstance(data, dict):
                raise ValueError("generic_api_body must be a JSON object for form body type")
            return data, None
        # raw
        raw = self._render_template(self.body_template, text)
        return raw, None

    def _extract_from_json_path(self, payload: Any) -> str:
        if self.extract_path is None:
            # best-effort defaults
            if isinstance(payload, dict):
                for key in [
                    "text",
                    "translation",
                    "translated_text",
                    "translatedText",
                    "result",
                ]:
                    if key in payload and isinstance(payload[key], str):
                        return payload[key]
            raise ValueError("No extract path provided and default keys not found in response")

        current = payload
        parts = [p for p in self.extract_path.split(".") if p]
        for part in parts:
            if isinstance(current, list) and part.isdigit():
                idx = int(part)
                current = current[idx]
            elif isinstance(current, dict):
                if part in current:
                    current = current[part]
                else:
                    raise KeyError(f"Path segment '{part}' not found in response")
            else:
                raise TypeError("Invalid path traversal in response payload")
        if isinstance(current, str):
            return current
        # allow object that contains content/text
        if isinstance(current, dict):
            for key in ["content", "text", "message"]:
                if key in current and isinstance(current[key], str):
                    return current[key]
        raise ValueError("Extracted value is not a string")

    @retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    def do_translate(self, text, rate_limit_params: dict = None):
        url = self._render_template(self.url_template, text)
        headers = self._parse_headers(text)
        params = self._parse_params(text)
        data, json_body = self._build_body(text, headers)

        logger.debug(f"GenericAPI request to {url} method={self.method}")
        resp = requests.request(
            method=self.method,
            url=url,
            headers=headers,
            params=params or None,
            data=data,
            json=json_body,
            timeout=self.timeout,
        )
        resp.raise_for_status()

        content_type = resp.headers.get("Content-Type", "")
        if "application/json" in content_type or resp.text.strip().startswith(("{", "[")):
            payload = resp.json()
            return self._extract_from_json_path(payload)

        # plain text fallback
        return resp.text.strip() 