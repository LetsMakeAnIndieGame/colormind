requirejs.config({
    baseUrl: './scripts',
    paths: {
        jquery: './jquery-2.2.0',
        colormind: './colormind'
    },
    shim: {
        'colormind': ['jquery']
    }
});