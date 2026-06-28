const {promises: fs} = require('fs');
const path = require('path');

class CommentsServiceEmailRenderer {
    constructor({t}) {
        this.t = t;
        // Compiled templates are fixed at build time, so cache them for the
        // lifetime of the process instead of re-reading/compiling on every render.
        this.compiledTemplates = new Map();

        this.Handlebars = require('handlebars').create();
        this.Handlebars.registerHelper('t', function (key, options) {
            let hash = options?.hash;
            const params = hash || options || {};

            return t(key, {
                ...params,
                interpolation: {escapeValue: false}
            });
        });
        this.Handlebars.registerHelper('concat', (...args) => {
            args.pop(); // Remove the options object
            return new this.Handlebars.SafeString(args.join(''));
        });
    }

    async renderEmailTemplate(templateName, data) {
        let htmlTemplate = this.compiledTemplates.get(templateName);
        if (!htmlTemplate) {
            const htmlTemplateSource = await fs.readFile(path.join(__dirname, './email-templates/', `${templateName}.hbs`), 'utf8');
            htmlTemplate = this.Handlebars.compile(htmlTemplateSource);
            this.compiledTemplates.set(templateName, htmlTemplate);
        }
        const {renderText} = require(`./email-templates/${templateName}.txt`);

        const html = htmlTemplate(data);
        const text = renderText(data, this.t);

        return {html, text};
    }
}

module.exports = CommentsServiceEmailRenderer;
