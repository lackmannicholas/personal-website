import React, { Component } from 'react';

export class Education extends Component {
    displayName = Education.name

    render() {
        return (
            <div>
                <h1>Education</h1>
                <p>My education journey</p>
                <fieldset>
                    <h2>Next Steps?</h2>
                    <h2>University of Washington</h2>
                    <h3>Master of Science in Computer Science</h3>
                    <p>
                        I am currently studying for the GRE to attend UW's professional Masters program to obtain a Master of Science in Computer Science degree. My MS CIS from Boston University was great in providing
                        me with the skills to be successful in work place, but now I want to go deeper. This program will build off of my current knowledge and take it to a much deeper understanding of the advanced
                        technologies being used today.
                    </p>
                </fieldset>
                <fieldset>
                    <h2>Boston University</h2>
                    <h3>Master of Science in Computer Information Systems</h3>
                    <p>
                        Boston University is where I obtained most of my formal computer science education. I took everything from Advanced Database Management to Web Mining, Rich Web Applications to Data Mining and Analytics. 
                        I wanted this degree to give me the breadth of knowledge I did not receive from my Bachelors.
                    </p>
                    <p>
                        This program was more about how to practically build computer systems rather than a deep-dive into the theory of computing and complexity. 
                        Coming from a position of needing to gain skills to progress my career, I appreciated this straightforward approach, and it immediately helped me be successful as a Software Developer.
                    </p>
                    <p>
                        I took this program while also working full-time and everyday I learned something I could use at work. However, going to school three quarter time and working full time was a major task in time management in itself.
                    </p>
                    <p>
                        Boston University taught me many things about working in the software industry. 
                        Most importantly has been to ship quality software quickly, as everyone has deadlines and lack of time is not an excuse for writing bad code.
                    </p>
                </fieldset>
                <fieldset>
                    <h2>Washington State University</h2>
                    <h3>Bachelors in Management Information Systems</h3>
                    <p>
                        As a transfer student from a community college, I only spent two years at Washington State University, but they were a great two years.
                        I started as an accounting major and came out a Management Information Systems major.
                        Accounting first spoke to me as a way to pursue my dream as an entrepreneur but along the way I was required to take an information systems class.
                    </p>
                    <p>
                        Having never taken an information systems class, I didn’t know what to expect. It was my first dip into the world of computers – outside a programming boot camp I went to in middle school. 
                        I absolutely loved everything about it. It was a very gentile introduction, and I was left wanting more.
                    </p>
                    <p>
                        I changed my major to Management Information Systems. If I had gone to a full Computer Science degree, I would have wasted time, energy, and money on all my business classes. 
                        Since I was paying for the degree myself, I decided I could not afford the luxury of starting back at my junior year from scratch. 
                        I instead supplemented my MIS degree with outside resources such as books on Java programming and database fundamentals.
                    </p>
                    <p>
                        WSU was a great experience, and I feel I benefited from the extensive business courses I took. I believe they give me a deeper insight into my impact as a Software Engineer on the business.
                    </p>
                </fieldset>
                <fieldset>
                    <h2>Tacoma Community College</h2>
                    <h3>Associates in Business Administration</h3>
                    <p>TCC, home of the Titans. My experience at TCC contained some of my favorite academic experiences. All of my teachers taught from real world experience and with a true passion for the class topics.</p>
                    <p>There is something truly raw about the learning experience at a community college. You are surrounded by people who are there to truly learn and better their lives. You get to hear peoples’ stories which might be vastly different than your own.</p>
                    <p>I am a proud TCC alumni and will always cherish my community college experience.</p>
                </fieldset>
            </div>
        );
    }
}
