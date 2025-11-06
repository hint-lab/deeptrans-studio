import importlib
import logging

from pdf2zh_next.config.model import SettingsModel
from pdf2zh_next.config.translate_engine_model import (
    NOT_SUPPORTED_TRANSLATION_ENGINE_SETTING_TYPE,
)
from pdf2zh_next.config.translate_engine_model import TRANSLATION_ENGINE_METADATA
from pdf2zh_next.config.translate_engine_model import TranslateEngineSettingError
from pdf2zh_next.translator.base_rate_limiter import BaseRateLimiter
from pdf2zh_next.translator.base_translator import BaseTranslator
from pdf2zh_next.translator.rate_limiter.qps_rate_limiter import QPSRateLimiter

logger = logging.getLogger(__name__)


def get_rate_limiter(settings: SettingsModel) -> BaseRateLimiter:
    if settings.translation.qps:
        return QPSRateLimiter(settings.translation.qps)
    else:
        return None


def get_translator(settings: SettingsModel) -> BaseTranslator:
    rate_limiter = get_rate_limiter(settings=settings)
    translator_config = settings.translate_engine_settings

    if isinstance(translator_config, NOT_SUPPORTED_TRANSLATION_ENGINE_SETTING_TYPE):
        raise TranslateEngineSettingError(
            f"{translator_config.translate_engine_type} is not supported, Please use other translator!"
        )

    for metadata in TRANSLATION_ENGINE_METADATA:
        if isinstance(translator_config, metadata.setting_model_type):
            translate_engine_type = metadata.translate_engine_type
            logger.info(f"Using {translate_engine_type} translator")
            model_name = f"pdf2zh_next.translator.translator_impl.{translate_engine_type.lower()}"
            module = importlib.import_module(model_name)
            if settings.translation.glossaries and not metadata.support_llm:
                raise TranslateEngineSettingError(
                    f"{translate_engine_type} does not support glossary. Please choose a different translator or remove the glossary."
                )
            translator = getattr(module, f"{translate_engine_type}Translator")(
                settings, rate_limiter
            )
            # Health check: perform a short translation ignoring cache to validate translator availability
            translator.translate("Hello", ignore_cache=True)
            return translator

    raise ValueError("No translator found")
