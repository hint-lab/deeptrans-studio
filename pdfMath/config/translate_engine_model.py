import re
import typing
from dataclasses import dataclass
from types import NoneType
from typing import Literal
from typing import TypeAlias

from pydantic import BaseModel
from pydantic import Field

# any field in SENSITIVE_FIELDS will be masked in GUI
GUI_SENSITIVE_FIELDS = []
# any field in GUI_PASSWORD_FIELDS will be masked in GUI and treated as password
GUI_PASSWORD_FIELDS = []


def _clean_string(value: str | None) -> str | None:
    """Clean string by trimming whitespace"""
    if value is None:
        return None
    return value.strip()


def _clean_url(value: str | None) -> str | None:
    """Clean URL for OpenAI-compatible services"""
    if value is None:
        return None
    cleaned = value.strip().rstrip("/")
    # Remove /chat/completions suffix for OpenAI-compatible APIs
    cleaned = re.sub(r"/chat/completions/?$", "", cleaned)
    return cleaned.rstrip("/")


def _check_if_positive_float(value: str | None, field: str = "Value") -> str | None:
    """Check if a string can be parsed as a positive float"""
    if value is None:
        return None

    try:
        f = float(value)
    except ValueError as e:
        raise ValueError(f"{field} must be a float") from e

    if f <= 0:
        raise ValueError(f"{field} must be greater than 0")

    return value


class TranslateEngineSettingError(Exception):
    """Translate engine setting error"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


## Please add the translator configuration class below this location.

# Please note that all translator configurations must be of string type,
# otherwise the GUI will not function properly!
#
# You should implement validation of the translator configuration in validate_settings.
# And complete type conversion (if any) in the corresponding implementation of the translator.

class DifySettings(BaseModel):
    """Dify settings"""

    translate_engine_type: Literal["Dify"] = Field(default="Dify")
    dify_url: str | None = Field(default=None, description="Dify url")
    dify_apikey: str | None = Field(default=None, description="Dify API Key")

    def validate_settings(self) -> None:
        if not self.dify_apikey:
            raise ValueError("Dify API Key is required")
        self.dify_apikey = _clean_string(self.dify_apikey)
        self.dify_url = _clean_string(self.dify_url)


GUI_PASSWORD_FIELDS.append("dify_apikey")
GUI_SENSITIVE_FIELDS.append("dify_url")


class GenericAPISettings(BaseModel):
    """Generic external API settings"""

    translate_engine_type: Literal["GenericAPI"] = Field(default="GenericAPI")
    support_llm: Literal["yes", "no"] = Field(
        default="no", description="Whether the translator supports LLM"
    )

    generic_api_model: str | None = Field(
        default="generic", description="Logical model name for display/cache"
    )
    generic_api_url: str | None = Field(default=None, description="API endpoint URL, placeholders supported: {text}, {lang_in}, {lang_out}")
    generic_api_method: str | None = Field(default="POST", description="HTTP method: GET/POST/PUT/PATCH")
    generic_api_headers: str | None = Field(default=None, description="HTTP headers as JSON string; placeholders supported")
    generic_api_params: str | None = Field(default=None, description="Query params as JSON string; placeholders supported")
    generic_api_body: str | None = Field(default=None, description="Request body template (raw string or JSON string); placeholders supported")
    generic_api_body_type: str | None = Field(default="json", description="Body type: json|form|raw")
    generic_api_timeout: str | None = Field(default=None, description="Timeout seconds")
    generic_api_extract_json_path: str | None = Field(default=None, description="Dot path to extract translation from JSON response, e.g. data.result.text or choices.0.message.content")

    def validate_settings(self) -> None:
        # 允许使用环境变量提供 URL（docker-compose 情况）
        import os
        if not self.generic_api_url:
            env_url = os.getenv("GENERIC_API_URL")
            if env_url:
                self.generic_api_url = env_url
        if not self.generic_api_url:
            raise ValueError("Generic API URL is required")
        self.generic_api_url = _clean_string(self.generic_api_url)
        self.generic_api_method = _clean_string(self.generic_api_method) or "POST"
        self.generic_api_headers = _clean_string(self.generic_api_headers)
        self.generic_api_params = _clean_string(self.generic_api_params)
        self.generic_api_body = _clean_string(self.generic_api_body)
        self.generic_api_body_type = (_clean_string(self.generic_api_body_type) or "json").lower()
        self.generic_api_timeout = _check_if_positive_float(_clean_string(self.generic_api_timeout), field="Timeout")
        self.generic_api_extract_json_path = _clean_string(self.generic_api_extract_json_path)
        self.generic_api_model = _clean_string(self.generic_api_model) or "generic"


GUI_SENSITIVE_FIELDS.append("generic_api_url")


## Please add the translator configuration class above this location.

# 所有翻译引擎
TRANSLATION_ENGINE_SETTING_TYPE: TypeAlias = (
    GenericAPISettings
    | DifySettings
)

# 不支持的翻译引擎
NOT_SUPPORTED_TRANSLATION_ENGINE_SETTING_TYPE: TypeAlias = NoneType

# 默认翻译引擎
_DEFAULT_TRANSLATION_ENGINE = GenericAPISettings
# 默认引擎可以包含细节配置；不再强制校验字段数量以兼容简化后的引擎集合

# The following is magic code,
# if you need to modify it,
# please contact the maintainer!

GUI_SENSITIVE_FIELDS.extend(GUI_PASSWORD_FIELDS)


@dataclass
class TranslationEngineMetadata:
    translate_engine_type: str
    cli_flag_name: str
    cli_detail_field_name: str | None
    setting_model_type: type[BaseModel]
    support_llm: bool

    def __init__(
        self,
        setting_model_type: type[BaseModel],
    ) -> None:
        self.translate_engine_type = setting_model_type.model_fields[
            "translate_engine_type"
        ].default
        self.cli_flag_name = self.translate_engine_type.lower()
        self.cli_detail_field_name = self.cli_flag_name + "_detail"
        self.setting_model_type = setting_model_type
        if len(setting_model_type.model_fields) == 1:
            self.cli_detail_field_name = None
        self.support_llm = (
            (sl := setting_model_type.model_fields.get("support_llm", None))
            and sl.default == "yes"
        ) or False


args = typing.get_args(TRANSLATION_ENGINE_SETTING_TYPE)

TRANSLATION_ENGINE_METADATA = [
    TranslationEngineMetadata(
        setting_model_type=arg,
    )
    for arg in args
]

TRANSLATION_ENGINE_METADATA_MAP = {
    metadata.translate_engine_type: metadata for metadata in TRANSLATION_ENGINE_METADATA
}


# auto check duplicate translation engine metadata
assert len(TRANSLATION_ENGINE_METADATA_MAP) == len(TRANSLATION_ENGINE_METADATA), (
    "Duplicate translation engine metadata"
)

# auto check duplicate cli flag name and cli detail field name
dedup_set = set()
for metadata in TRANSLATION_ENGINE_METADATA:
    if metadata.cli_flag_name in dedup_set:
        raise ValueError(f"Duplicate cli flag name: {metadata.cli_flag_name}")
    dedup_set.add(metadata.cli_flag_name)
    if metadata.cli_detail_field_name and metadata.cli_detail_field_name in dedup_set:
        raise ValueError(
            f"Duplicate cli detail field name: {metadata.cli_detail_field_name}"
        )
    dedup_set.add(metadata.cli_detail_field_name)
del dedup_set

DEFAULT_TRANSLATION_ENGINE_METADATA = TRANSLATION_ENGINE_METADATA_MAP[
    _DEFAULT_TRANSLATION_ENGINE.model_fields["translate_engine_type"].default
]

if __name__ == "__main__":
    print(TRANSLATION_ENGINE_METADATA_MAP)
