---
title: "How to avoid leaks in modern C++"
date: "2025-04-17"
description: "Idioms, techniques and tools used to prevent and catch memory leaks"
thumbnail: ""
pinned: false
---
C and C++ are often criticized for the potential memory leaks they allow - the programmer has full control but also full responsibility. In this post I will elaborate on some idioms and techniques modern C++ offers that make it quite easy to write memory safe code while still enjoying all the performance benefits of C++.

# Why C++?
You might be asking 'Why even use C++ if it's not inherently memory safe?'. Good question. Definitely not for its nice syntax. The reason people choose C++ is that it's **fast** and it gives you **full control over memory**. If your application is not performance critical though, go with something different.

# RAII
`RAII` is a programming idiom that facilitates memory management by introducing clear responsibilities. It stands for `Resource Acquisition Is Initialization` and basically means tying the lifecycle of a resource to that of an object. `Resource` means here something that must be acquired before use (allocate heap memory, open file, open socket etc.) and that usually must also be cleaned up afterwards  (free memory, close file descriptor etc).

```cpp
#include <cstddef>

class Allocator {
private:
  std::byte *ptr_;

public:
  explicit Allocator(size_t nBytes)
      : ptr_{new std::byte[nBytes]} // <-- resource acquisition
  {
  }

  ~Allocator() {
    delete[] ptr_; // <-- resource cleanup
  }
};
```

The object that acquires the resource takes the ownership of it. When it runs out of scope, the destructor is called automatically (including stack unwinding when an exception is thrown) and the cleanup is performed. We no longer need to remember to delete the allocated memory.

# Rule of Three / Five
Now that's great but if we stick to the example above we might run into problems. Let's just imagine the following scenario:
```cpp
{
  Allocator someHeap(5);
  {
    Allocator shallowCopy(someHeap);
  } // <- copy runs out of scope -> destructor called
}   // <- original runs out of scope -> destructor called
```

Since we didn't provide a copy constructor, the compiler will do so for us, resulting in a shallow copy of the pointer. As soon as one of the instances runs out of scope, the memory will be freed  and the other object - while still in scope - becomes invalid. When we try to access this pointer or the object runs out of scope and the destructor is called, the program will crash.

To avoid this, there is the `Rule of Three / Five`. It's a guideline that states: **As soon as you implement any of the following, you should implement them all**
1. Destructor
1. Copy Constructor
1. Copy Assignment Operator
1. Move constructor
1. Move Assignment Operator

For our example, the implementation of these methods heavily depends on what you want - maybe you want to deep copy the memory? maybe you want to reference it and only deallocate once the last object runs out of scope? More on this later. For now, we will simply delete them:
```cpp
Allocator(const Allocator &) = delete;
Allocator &operator=(const Allocator &) = delete;
Allocator(Allocator &&) = delete;
Allocator &operator=(Allocator &&) = delete;
```

# 0 cost abstractions
Now you might say: 'that's great but all these abstractions will be costly'. In that case, welcome to C++ and its `0 cost abstractions`. As the name suggests C++ makes it possible to create abstractions without any performance overhead. I added a `data()` method to the class above that retrieves the pointer and then ran the following code with compiler optimization `-O2`:
```cpp
volatile void *sink;

void withAbstraction() {
    Allocator someHeap(5);
    sink = someHeap.data();
}

void withoutAbstraction() {
    std::byte *ptr = new std::byte[5];
    sink = ptr;
    delete[] ptr;
}
```

The assembly output:
```assembly
"withAbstraction()":
        sub     rsp, 8
        mov     edi, 5
        call    "operator new[](unsigned long)"
        mov     rdi, rax
        mov     QWORD PTR "sink"[rip], rax
        call    "operator delete[](void*)"
        add     rsp, 8
        ret

"withoutAbstraction()":
        sub     rsp, 8
        mov     edi, 5
        call    "operator new[](unsigned long)"
        mov     rdi, rax
        mov     QWORD PTR "sink"[rip], rax
        call    "operator delete[](void*)"
        add     rsp, 8
        ret
```
As you can see they are the same. The compiler optimized any overhead away.

# Smart pointers
Earlier I mentioned that the implementation for a copy constructor (and any of the other constructors and operators) is really dependent on how you want that specific pointer to be used. Should it be shared or stay unique? If it's shared, when is it deallocated?
Since this is a very common scenario, C++11 introduced so-called `smart pointers`: `unique pointer`, `shared pointer` and `weak pointer`. They clarify resource ownership and handle the cleanup for you. They are so heavily used that in many codebases `new` is completely abandoned - in fact it's been so long since I last used `new` that I needed to double-check the syntax when writing this post.

Let's take a closer look at each of them.

## Unique pointers
Unique pointers are the simplest form of smart pointers. They are used if you don't intend to copy this pointer. In fact, copying a unique pointer is actually impossible. The ownership can only be moved to another unique pointer.
```cpp
std::unique_ptr<int> ptr = std::make_unique<int>();
// std::unique_ptr<int> copy = ptr; // <-- this will not compile
std::unique_ptr<int> otherPtr = std::move(ptr);
```

It is also possible to initialize the unique pointer with a custom delete function to handle other resources such as file descriptors.


## Shared pointers
Now sometimes you have the situation where you need to reference the same resource multiple times. This is where you want a shared pointer. Shared pointers can be copied and each new reference increments an internal reference count. The memory is only freed once the last referencing object is being destructed.
```cpp
std::shared_ptr<int> ptr = std::make_shared<int>();
std::shared_ptr<int> copy = ptr;
```

Given the internal reference tracking, this pointer comes with some overhead.

## Weak pointers
Weak pointers work similar to shared pointers and are usually used in combination with them. They can also be copied and moved but they don't increase the reference count of an object and thus won't keep it alive.
```cpp
std::weak_ptr<int> weakPtr;
{
  std::shared_ptr<int> ptr = std::make_shared<int>();
  weakPtr = ptr;                                // <-- copied
  std::cout << weakPtr.expired() << std::endl;  // output: 0
}
std::cout << weakPtr.expired() << std::endl;    // output: 1
```

Since weak pointers don't own the resource, you cannot access it directly through the weak pointer either. You can only check whether the memory is still valid and how many times it is being referenced.
You can always transform a valid weak pointer into a shared pointer though using the `lock()` method:
```cpp
std::shared_ptr<int> shared = weakPtr.lock();
```

# Tooling
Last but not least, let's have a look at some tooling that can help you discover memory leaks inside your code. I will focus on the two options I use the most. Both of them also help discover other forms of memory related bugs like out-of-bounds access.

## AddressSanitizer
AddressSanitizer adds shadow memory to your program that helps track allocations and deallocations. For this, it needs to be compiled into your program by adding the compile flag `-fsanitize=address`. After you ran the program or if a crash occurs, the sanitizer will provide you with a clear overview in case there was any issue - telling you the stack trace and the size of the leak.

On the downside, it slows down your program quite a bit and changes your actual binary. Also it can only catch bugs in the code it was actually compiled into - linked libraries might leak undetected.

## Valgrind
Valgrind on the other hand doesn't require any compile-time changes even though I would in general recommend adding debugging information with `-g` for all sorts of debugging. You simply run the executable like this:
```bash
valgrind <path_to_your_executable>
```

Similar to address sanitizers it will provide you with a clear overview at the end.

