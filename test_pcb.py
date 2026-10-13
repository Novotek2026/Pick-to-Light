


import serial
import time

with serial.Serial("COM5", 9600, timeout=2) as port:
    time.sleep(0.2)

    test_message = b"PTL_TEST_123\r\n"
    port.write(test_message)
    port.flush()

    received = port.read(len(test_message))

    print("Sent:    ", repr(test_message))
    print("Received:", repr(received))

    if received == test_message:
        print("PASS: Adapter loopback works.")
    else:
        print("FAIL: Check TXD-RXD jumper and adapter.")
