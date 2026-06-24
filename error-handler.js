(function () {
    const ERROR_STORAGE_KEY = 'cinesphere-unexpected-error';
    const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again later.';
    let isRedirecting = false;

    function isPlainObject(value) {
        return value !== null && typeof value === 'object';
    }

    function normalizeMessage(value) {
        if (!value) return '';
        const text = String(value).trim();
        return text || '';
    }

    function extractErrorMessage(source, fallback = DEFAULT_ERROR_MESSAGE) {
        if (!source) return fallback;

        if (typeof source === 'string') {
            return normalizeMessage(source) || fallback;
        }

        if (source instanceof Error) {
            return normalizeMessage(source.message) || fallback;
        }

        if (isPlainObject(source)) {
            const nestedSources = [
                source.message,
                source.error,
                source.reason,
                source.description,
                source.statusText,
                source.data?.message,
                source.data?.error,
                source.response?.message,
                source.response?.error,
                source.response?.data?.message,
                source.response?.data?.error
            ];

            for (const candidate of nestedSources) {
                const message = extractErrorMessage(candidate, '');
                if (message) return message;
            }
        }

        return fallback;
    }

    function storeErrorPayload(source, fallback) {
        const message = extractErrorMessage(source, fallback);
        const payload = {
            message,
            timestamp: new Date().toISOString(),
            path: window.location.pathname
        };

        try {
            localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(payload));
        } catch (storageError) {
            console.error('Could not store error payload:', storageError);
        }

        return payload;
    }

    function redirectToErrorPage(source, fallback = DEFAULT_ERROR_MESSAGE) {
        const currentPath = (window.location.pathname || '').toLowerCase();
        if (isRedirecting || currentPath.endsWith('/error.html') || currentPath.endsWith('error.html')) {
            return;
        }

        isRedirecting = true;
        const payload = storeErrorPayload(source, fallback);
        const target = `error.html?message=${encodeURIComponent(payload.message)}`;
        window.location.replace(target);
    }

    window.CineSphereError = {
        extractErrorMessage,
        redirectToErrorPage,
        ERROR_STORAGE_KEY,
        DEFAULT_ERROR_MESSAGE
    };

    window.addEventListener('error', event => {
        const source = event?.error || event?.message || DEFAULT_ERROR_MESSAGE;
        redirectToErrorPage(source);
    });

    window.addEventListener('unhandledrejection', event => {
        if (typeof event?.preventDefault === 'function') {
            event.preventDefault();
        }

        redirectToErrorPage(event?.reason || DEFAULT_ERROR_MESSAGE);
    });
})();
