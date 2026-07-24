'use client';

import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
    setTranslationStage,
    TranslationStage,
    setSourceText,
    setTargetText,
    setSourceLanguage,
    setTargetLanguage,
    clearTranslationContent,
    setTranslationContent,
} from '@/store/features/translationSlice';

export const useTranslationState = () => {
    const dispatch = useAppDispatch();
    const currentStage = useAppSelector(
        state =>
            (state.translation as { currentStage: TranslationStage })?.currentStage ?? 'waiting'
    );
    const setCurrentStage = (stage: TranslationStage) => dispatch(setTranslationStage(stage));
    return { currentStage, setCurrentStage };
};

export const useTranslationContent = () => {
    const dispatch = useAppDispatch();
    const contentItemId = useAppSelector(
        state => (state.translation as { contentItemId: string })?.contentItemId ?? ''
    );
    const sourceText = useAppSelector(
        state => (state.translation as { sourceText: string })?.sourceText ?? ''
    );
    const targetText = useAppSelector(
        state => (state.translation as { targetText: string })?.targetText ?? ''
    );
    const setSourceTranslationText = (sourceText: string) => dispatch(setSourceText(sourceText));
    const setTargetTranslationText = (targetText: string) => dispatch(setTargetText(targetText));
    const clearContent = () => dispatch(clearTranslationContent());
    const setContent = (content: { itemId: string; sourceText: string; targetText?: string }) =>
        dispatch(setTranslationContent(content));
    return {
        contentItemId,
        sourceText,
        targetText,
        clearTranslationContent: clearContent,
        setTranslationContent: setContent,
        setSourceTranslationText,
        setTargetTranslationText,
    };
};

export const useTranslationLanguage = () => {
    const dispatch = useAppDispatch();
    const sourceLanguage = useAppSelector(
        state => (state.translation as { sourceLanguage: string })?.sourceLanguage ?? 'auto'
    );
    const targetLanguage = useAppSelector(
        state => (state.translation as { targetLanguage: string })?.targetLanguage ?? 'auto'
    );
    const setSourceTranslationLanguage = (sourceLanguage: string) =>
        dispatch(setSourceLanguage(sourceLanguage));
    const setTargetTranslationLanguage = (targetLanguage: string) =>
        dispatch(setTargetLanguage(targetLanguage));
    return {
        sourceLanguage,
        targetLanguage,
        setSourceTranslationLanguage,
        setTargetTranslationLanguage,
    };
};
