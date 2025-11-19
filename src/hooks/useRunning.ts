'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setRunning, setErrorMessage } from '@/store/features/runningSlice';

type UseRunningResult = {
    isRunning: boolean;
    errorMessage: string;
    setIsRunning: (value: boolean) => void;
    setRunningErrorMessage: (message: string) => void;
    clearRunningErrorMessage: () => void;
};

export const useRunningState = (): UseRunningResult => {
    const dispatch = useAppDispatch();
    const isRunning = useAppSelector((state) => (state as any)?.running?.isRunning ?? false);
    const errorMessage = useAppSelector((state) => (state as any)?.running?.errorMessage ?? '');

    const setIsRunning = (value: boolean) => dispatch(setRunning(value));
    const setRunningErrorMessage = (message: string) => dispatch(setErrorMessage(message));
    const clearRunningErrorMessage = () => dispatch(setErrorMessage(''));

    return {
        isRunning,
        errorMessage,
        setIsRunning,
        setRunningErrorMessage,
        clearRunningErrorMessage,
    };
};

export default useRunningState;

