import React, { Component } from 'react';

export class Experience extends Component {
    displayName = Experience.name

    ts = "Terminal<b>Smart</b>";

    render() {
        return (
            <div>
                <h1>Experience</h1>

                <fieldset>
                    <h2>AIRSIS (subsidiary of Oceaneering)</h2>
                    <h3><i>Software Developer II</i></h3>
                    <p>
                        I started at AIRSIS in August of 2014, and have been working mostly on the same application since. The application, TerminalSmart, is a maritime dock logistics application. It keeps track
                        of operations and events the occur when a vessel or barge is coming into port to either load or unload cargo. Since 2014, I have maintained or developed on almost every aspect of this application
                        including at every level of the development stack. 
                    </p>
                    <p>
                        We are an agile development process, and we use mostly Microsoft tools. In my time at AIRSIS my most interesting projects have been:
                    </p>
                    <ul>
                        <li>Re-Architected security from Web Forms Auth to <b>Single Sign-On with OIDC and OAuth2.0</b></li>
                        <li><b>Built 2 Asp Net Core & Angular 6.0</b> web projects which support TerminalSmart from requirements to production</li>
                        <li><b>Web Sockets</b> implementation into an ASP.NET Web API through the use of <b>SignalR</b></li>
                        <li><b>Windows Service</b> that consolidates several file-based integrations</li>
                        <li>Build and maintain xml based intergations from third parties</li>
                        <li>Build several re-usable JavaScript libraries/tools used throughout the App</li>
                        <li>Demurrage Calculator (Featured in World Port Development May 2015): a monetary estimate of liability</li>
                        <li><b>Database Design</b>: Including optimization, table design, and stored procedures</li>
                    </ul>
                </fieldset>
            </div>
        );
    }
}