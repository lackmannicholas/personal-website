import React, { Component } from 'react';

export class Home extends Component {
  displayName = Home.name

  render() {
    return (
      <div>
            <h1>Hello, world!</h1>

            <p>
                This is my - Nick Lackman - personal website/portfolio/blog. I will be updating this site as my career in software engineering continues. It is built with basic React, and deployed using AWS. Rigth now it's in a S3
                static content bucket, but will most likely move to an EC2 instance as this site grows. I am still learning both React and AWS and I am using this site as an avenue to learn both. Bear with me
                if you run into any issues.
            </p>
            <p>
                I have been developing web applications for the past 6 years, and it's time to share my expeirence with everyone. I'll be tackling everything from basic data structures to the build process, from
                UI to Distributed Systems. I'll be updating this site every few days, so stay tuned for new content!
            </p>
      </div>
    );
  }
}
