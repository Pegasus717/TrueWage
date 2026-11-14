# Real screenshots for the accuracy check

Put 15 to 30 real earnings screenshots here (Rapido, Zomato, Swiggy, Uber, Ola ...) with names, phone numbers and exact addresses cropped out.
Next to each image `name.png` add `name.json` with what it really says, for example:

```json
{"orders": [{"pay": 52, "km": 3.2}, {"pay": 38, "km": 1.8}], "count": 2}
```

Then, with the server running and an API key set:

```bash
python tools/accuracy_eval.py
```

It prints PASS/FAIL per check and an overall percentage. Use that number, with the sample size, in your submission.
