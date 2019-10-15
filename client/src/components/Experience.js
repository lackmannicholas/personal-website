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
                        I started at AIRSIS in August of 2014, and have been working mostly on the two applications since. 
                        <p>
                            Terminal<b>Smart</b> is a maritime dock logistics application. 
                            It keeps track of operations and events the occur when a vessel or barge is coming into port to either load or unload cargo.
                            From 2014 until June 2019, I have maintained or developed on almost every aspect of this application including at every level of the development stack. 
                        </p>
                        <p>
                            OceanSmart is the latest project I am on, and could not be more different from Terminal<b>Smart</b> from a tech stack perspective.
                            We're using the (M)ongoDB (E)xpress (R)eact (N)odejs stack, and tieing Graphql into the Express server.
                            Apollo is our Graphql engine of choice. So far I have been responsible for evaulating architectural desicions for our
                            Graphql layer as well as our IAM implementation. We are using Okta as our third party Identity Provider for OAuth2 and OIDC.
                        </p>
                    </p>
                    <p>
                        We are an agile development process, and we use mostly Microsoft tools. In my time at AIRSIS my most interesting projects have been:
                    </p>
                    <ul>
                        <li>Building the foundations of OceanSmart</li>
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