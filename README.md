## Inspiration

Clinical ADHD and its sub-clinical varieties are widely misunderstood and trivialized as "issues with focus" while it is more often the case that people on the ADHD spectrum can focus [better than neurotypical individuals](https://health.clevelandclinic.org/hyperfocus-and-adhd), they just can't choose **what** to focus on. In our present understanding, this is because of a [tendency to prefer novel and highly rewarding stimuli over constant or delayed rewards](https://pmc.ncbi.nlm.nih.gov/articles/PMC2626918/).

We wondered if it would help if the object of our focus had us invested in more than just the task at hand, and nothing motivates us like a cute little panda being as happy as they can be!

## What it does

At a glance PomoDojo is a todo list app which incorporates elements of the Tamagotchi digital pet to add a layer of responsibility and emotional investment to each task. Each task follows a Pomodoro system timer of structured work session and short, interleaved breaks. Just like you wouldn't want your pet to overwork themselves, they don't want you to overwork yourself either.

However, this concept itself isn't novel. Apps like StudyBunny also follow the same principle. Where PomoDojo excels is at tracking if your focus is actually on the task you're supposed to be doing **a major issue for people with ADHD**. One moment you could be working on a math problem and the next you're researching dubious facts about panda biology. 

CBT treatment for ADHD involves learning a skillset that keeps people accountable to a certain train of thought, slowly training the mind to notice when distractions are about to take over. This requires significant effort and time and is usually augmented by a therapist or coach acting as a supervisor. But a supervisor can't tell if you're actually **solving** a problem or just staring at the screen.

This is where the Muse S EEG headset comes in.
Using EEG, we can get a heuristic for if your thoughts are constantly wandering or are in a consistent state of focus, augmenting this with tracking the rate at which you blink (we usually blink less when we're concentrating on the thing in front of us), PomoDojo notifies the user that it thinks their mind has begun to wander. And who better to tell you that than your cute Panda friend?

## How we built it

Starting from a basis of asking "what keeps us motivated even when we *really* don't want to do something" and we came to the conclusion that often it tends to be a sense of accountability to someone we care about. 

They don't even have to understand the concept of studying! But imagine if they could read your mind and nudge you to get back on track.

Using the Muse S EEG headset, we wondered how we would track if someone is focused or not. Doing some [cursory research on the relationship between different brain waves and focus states](https://nhahealth.com/brainwaves-the-language/) we set up a prototype python program that worked surprisingly well to tell the difference between us doing a typing test on MonkeyType, and occasionally being hit with the urge to doomscroll on our apps of choice.

Similarly, to augment the focus information, we settled on the idea of measuring the rate at which we blinked as a heuristic for attention. 

If staring at the screen while thinking hard about something entirely different (**because that is still focus**) would change how often someone blinks and allow someone looking at the metrics to tell if the person was actually paying attention then we had a plan! And it turns out, while not extremely consistent between different subjects it does serve to improve the accuracy of the EEG data.

## Challenges we ran into (& then solved)
The most challenging aspect was definitely trying to get the two disparate modes of information to make sense to our own experiments and to then play along with each other, accounting for time-series data and working around the limitations of browser-only solutions like javascript + ble. 

Another challenge was getting a hold of any pre-existing projects that tried to do the same thing to avoid reinventing the wheel. As far as our quick market research showed us while the idea of tracking focus isn't unique to us, from the first-person experience of one of our team members who has ADHD, using it to keep someone accountable is something new we have brought to the table.

## What we learned

While PomoDojo isn't perfect by any means, if using it means a handful of people can feel more in control of their own focus, it has fulfilled its purpose. Our experience while working on it not only taught us more about the domains of Neuroscience, Neurotechnology and the fundamentals of product design, but also brought us close by understanding the inner workings of people who don't think the same way we do. 

## What's next for PomoDojo

A major leap forward for PomoDojo would be to organize a set of controlled experiments to first measure large groups of people's EEG data while they're either focused or distracted, and simultaneously measure their blink rate to augment it. 

This data would be extremely beneficial as an input to multimodal AI models to then draw significantly more accurate inferences for individuals.
